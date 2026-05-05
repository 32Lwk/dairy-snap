import { inferCalendarEventCategory } from "@/lib/calendar-opening-infer-event";
import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentQualityChatFallbackModel,
  getAgentQualityChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { suggestsParttimeCalendarName } from "@/lib/user-settings";
import { fetchCalendarEventsStartingOnDay, type CalendarEventBrief } from "@/server/calendar";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

const WORK_KEYWORDS = ["バイト", "アルバイト", "シフト", "出勤", "勤務", "残業", "退勤", "職場", "レジ"];

function titleSuggestsWorkShift(title: string): boolean {
  const t = title.toLowerCase();
  return WORK_KEYWORDS.some((w) => t.includes(w.toLowerCase()));
}

function eventIsWorkRelated(ev: CalendarEventBrief, req: AgentRequest): boolean {
  if (titleSuggestsWorkShift(ev.title)) return true;
  if (suggestsParttimeCalendarName(ev.calendarName)) return true;
  const fixed = (ev.fixedCategory ?? "").trim();
  if (fixed === "parttime" || fixed === "job_hunt") return true;
  const cat = inferCalendarEventCategory(ev, req.calendarOpening ?? null);
  return cat === "parttime" || cat === "job_hunt";
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

export async function runCalendarWorkAgent(req: AgentRequest): Promise<AgentResponse> {
  let eventsBlock = "（バイト・業務系予定なし）";

  try {
    const cal = await fetchCalendarEventsStartingOnDay(req.userId, req.entryDateYmd);
    if (cal.ok && cal.events.length > 0) {
      const workEvents = cal.events.filter((ev) => eventIsWorkRelated(ev, req));
      if (workEvents.length > 0) {
        eventsBlock = workEvents
          .map((ev) => {
            const start = hhmmTokyo(ev.start);
            const end = hhmmTokyo(ev.end);
            const when = start ? (end ? `${start}〜${end}` : start) : "終日";
            const title = ev.title?.trim() || "（タイトルなし）";
            const hint = suggestsParttimeCalendarName(ev.calendarName) ? " | calendarHint=シフト系" : "";
            return `- time=${when} | title=${title}${hint}`;
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

  const systemPrompt = loadAgentPrompt("calendar-work");
  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    `## バイト・業務系予定\n${eventsBlock}`,
    memoryLines ? `## ドメインメモリ（勤務先・シフト傾向）\n${memoryLines}` : "",
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = getOpenAI();
  const completion = await withChatModelFallback(
    getAgentQualityChatModel(),
    getAgentQualityChatFallbackModel(),
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
  const hasRelevantInfo = answer.length > 0 && eventsBlock !== "（バイト・業務系予定なし）";

  return { answer, hasRelevantInfo };
}
