import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentSocialMiniChatFallbackModel,
  getAgentSocialMiniChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { fetchCalendarEventsForDay } from "@/server/calendar";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

const EXCLUDE_KEYWORDS = [
  "バイト", "アルバイト", "シフト", "出勤", "勤務", "残業",
  "授業", "講義", "ゼミ", "試験", "テスト", "レポート", "課題",
  "面接", "ES", "説明会", "選考", "内定", "インターン",
];

function isSocialEvent(title: string): boolean {
  const t = title.toLowerCase();
  return !EXCLUDE_KEYWORDS.some((w) => t.includes(w.toLowerCase()));
}

function hhmmTokyo(isoLike: string): string {
  if (!isoLike || /^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return "";
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export async function runCalendarSocialAgent(req: AgentRequest): Promise<AgentResponse> {
  let eventsBlock = "（社交・個人予定なし）";

  try {
    const cal = await fetchCalendarEventsForDay(req.userId, req.entryDateYmd);
    if (cal.ok && cal.events.length > 0) {
      const socialEvents = cal.events.filter((ev) => isSocialEvent(ev.title));
      if (socialEvents.length > 0) {
        eventsBlock = socialEvents
          .slice(0, 8)
          .map((ev) => {
            const time = hhmmTokyo(ev.start);
            return `- ${ev.title}${time ? ` (${time})` : ""}${ev.location ? ` @${ev.location}` : ""}`;
          })
          .join("\n");
      }
    }
  } catch {
    eventsBlock = "（カレンダー取得失敗）";
  }

  const memoryLines = Object.entries(req.agentMemory)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const systemPrompt = loadAgentPrompt("calendar-social");
  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    req.persona.mbtiHint ? `## MBTIヒント\n${req.persona.mbtiHint}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    `## 社交・個人予定\n${eventsBlock}`,
    memoryLines ? `## ドメインメモリ（人間関係・記念日）\n${memoryLines}` : "",
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = getOpenAI();
  const completion = await withChatModelFallback(
    getAgentSocialMiniChatModel(),
    getAgentSocialMiniChatFallbackModel(),
    (model) =>
      openai.chat.completions.create({
        model,
        ...chatCompletionOutputTokenLimit(model, 400),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextBlock },
        ],
      }),
  );

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  const hasRelevantInfo = answer.length > 0 && eventsBlock !== "（社交・個人予定なし）";

  return { answer, hasRelevantInfo };
}
