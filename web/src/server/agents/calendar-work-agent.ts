import { prisma } from "@/server/db";
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

const DOMAIN = "calendar_work";

const WORK_KEYWORDS = ["バイト", "アルバイト", "シフト", "出勤", "退勤", "勤務", "レジ", "インターン", "就活", "面接", "ES", "説明会", "選考"];

function isWorkEvent(title: string, description: string): boolean {
  const hay = `${title} ${description}`.toLowerCase();
  return WORK_KEYWORDS.some((k) => hay.includes(k));
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

export async function runCalendarWorkAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();
  try {
    const cal = await fetchCalendarEventsForDay(req.userId, req.entryDateYmd);
    const allEvents = cal.ok ? cal.events : [];
    const workEvents = allEvents.filter((ev) => isWorkEvent(ev.title, ev.description));

    const memory = await loadAgentMemory(req.userId, DOMAIN);
    const basePrompt = loadAgentPrompt("calendar-work");
    const systemPrompt = prependPersonaInstructions(basePrompt, req.persona.instructionText);

    const eventsText =
      workEvents.length > 0
        ? workEvents
            .slice(0, 5)
            .map((ev) => {
              const timing = timingLabel(ev.start, ev.end);
              const time = ev.start.includes("T")
                ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ev.start))
                : "";
              return `- ${ev.title}${time ? ` ${time}` : ""}（${timing}）`;
            })
            .join("\n")
        : "（バイト・業務予定なし）";

    const contextBlock = buildContextBlock({ ...req, agentMemory: memory });
    const userMsg = [
      contextBlock,
      `### 当日のバイト・業務予定\n${eventsText}`,
      `### オーケストレーターからの質問\n${req.extraContext?.question ?? req.userMessage}`,
    ].join("\n\n");

    const { text, latencyMs } = await callSubAgentLLM({ systemPrompt, userMessage: userMsg, maxTokens: 400 });

    return { agentName: DOMAIN, answer: text, updatedMemory: [], model: "gpt-4o-mini", latencyMs: Date.now() - started };
  } catch (e) {
    return buildErrorResponse(DOMAIN, e);
  }
}
