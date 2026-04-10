import { getOpenAI } from "@/lib/ai/openai";
import { fetchCalendarEventsForDay } from "@/server/calendar";
import { prisma } from "@/server/db";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

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

function timingStatus(ev: { start: string; end: string }): "all_day" | "upcoming" | "ongoing" | "past" {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ev.start)) return "all_day";
  const s = Date.parse(ev.start);
  const e = Date.parse(ev.end || ev.start);
  const n = Date.now();
  if (!Number.isFinite(s)) return "upcoming";
  if (n < s) return "upcoming";
  if (n > (Number.isFinite(e) ? e : s)) return "past";
  return "ongoing";
}

const WORK_KEYWORDS = ["バイト", "アルバイト", "シフト", "出勤", "勤務", "残業", "職場"];
const SCHOOL_KEYWORDS = ["授業", "講義", "ゼミ", "試験", "テスト", "レポート", "課題"];

function isWorkEvent(title: string): boolean {
  return WORK_KEYWORDS.some((w) => title.includes(w));
}
function isSchoolEvent(title: string): boolean {
  return SCHOOL_KEYWORDS.some((w) => title.includes(w));
}

export async function runCalendarDailyAgent(req: AgentRequest): Promise<AgentResponse> {
  let eventsBlock = "（カレンダー未連携または予定なし）";

  try {
    const cal = await fetchCalendarEventsForDay(req.userId, req.entryDateYmd);
    if (cal.ok && cal.events.length > 0) {
      const filtered = cal.events
        .slice(0, 15)
        .filter((ev) => !isWorkEvent(ev.title) && !isSchoolEvent(ev.title));

      if (filtered.length > 0) {
        eventsBlock = filtered
          .map((ev) => {
            const time = hhmmTokyo(ev.start);
            const status = timingStatus(ev);
            return `- ${ev.title}${time ? ` (${time})` : ""} [${status}]`;
          })
          .join("\n");
      } else {
        eventsBlock = "（該当予定なし）";
      }
    }
  } catch {
    eventsBlock = "（カレンダー取得失敗）";
  }

  const systemPrompt = loadAgentPrompt("calendar-daily");
  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    req.persona.mbtiHint ? `## MBTIヒント\n${req.persona.mbtiHint}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    `## 対象日の予定\n${eventsBlock}`,
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: contextBlock },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  const hasRelevantInfo = answer.length > 0 && eventsBlock !== "（カレンダー未連携または予定なし）" && eventsBlock !== "（該当予定なし）";

  return { answer, hasRelevantInfo };
}
