import { fetchCalendarEventsForDay } from "@/server/calendar";
import type { AgentRequest, AgentResponse } from "@/server/agents/types";
import {
  loadAgentPrompt,
  loadAgentMemory,
  prependPersonaInstructions,
  buildContextBlock,
  callSubAgentLLM,
  buildErrorResponse,
} from "@/server/agents/agent-helpers";

const DOMAIN = "calendar_social";

const SOCIAL_KEYWORDS = [
  "友達", "友人", "飲み会", "ランチ", "食事", "帰省", "家族", "同窓会",
  "デート", "記念日", "彼氏", "彼女", "誕生日", "パーティー", "お祝い",
  "サークル", "部活", "集まり", "オフ会",
];
const EXCLUDE_KEYWORDS = [
  "バイト", "アルバイト", "シフト", "講義", "授業", "試験", "ゼミ",
];

function isSocialEvent(title: string, description: string): boolean {
  const hay = `${title} ${description}`.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((k) => hay.includes(k))) return false;
  return SOCIAL_KEYWORDS.some((k) => hay.includes(k));
}

function timingLabel(start: string, end: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return "終日";
  const s = Date.parse(start);
  const e = Date.parse(end || start);
  const n = Date.now();
  if (!Number.isFinite(s)) return "予定";
  if (n < s) return "これから";
  if (n > (Number.isFinite(e) ? e : s)) return "終了";
  return "進行中";
}

export async function runCalendarSocialAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();
  try {
    const cal = await fetchCalendarEventsForDay(req.userId, req.entryDateYmd);
    const allEvents = cal.ok ? cal.events : [];
    const socialEvents = allEvents.filter((ev) => isSocialEvent(ev.title, ev.description));

    const memory = await loadAgentMemory(req.userId, DOMAIN);
    const basePrompt = loadAgentPrompt("calendar-social");
    const systemPrompt = prependPersonaInstructions(basePrompt, req.persona.instructionText);

    const eventsText =
      socialEvents.length > 0
        ? socialEvents
            .slice(0, 5)
            .map((ev) => {
              const timing = timingLabel(ev.start, ev.end);
              const time = ev.start.includes("T")
                ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ev.start))
                : "";
              return `- ${ev.title}${time ? ` ${time}` : ""}（${timing}）${ev.location ? ` @${ev.location}` : ""}`;
            })
            .join("\n")
        : "（友人・家族・社交系の予定なし）";

    const contextBlock = buildContextBlock({ ...req, agentMemory: memory });
    const userMsg = [
      contextBlock,
      `### 当日の友人・家族・社交系予定\n${eventsText}`,
      `### オーケストレーターからの質問\n${req.extraContext?.question ?? req.userMessage}`,
    ].join("\n\n");

    const { text, latencyMs } = await callSubAgentLLM({ systemPrompt, userMessage: userMsg, maxTokens: 400 });

    return { agentName: DOMAIN, answer: text, updatedMemory: [], model: "gpt-4o-mini", latencyMs: Date.now() - started };
  } catch (e) {
    return buildErrorResponse(DOMAIN, e);
  }
}
