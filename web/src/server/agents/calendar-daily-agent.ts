import { prisma } from "@/server/db";
import { parseUserSettings } from "@/lib/user-settings";
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

const DOMAIN = "calendar_daily";

const WORK_KEYWORDS = ["バイト", "アルバイト", "シフト", "出勤", "退勤", "勤務", "レジ", "インターン", "就活"];
const SCHOOL_KEYWORDS = ["講義", "授業", "ゼミ", "試験", "テスト", "レポート", "課題", "発表", "学校", "大学", "高校"];
const ROMANCE_KEYWORDS = ["デート", "記念日", "彼氏", "彼女", "交際", "告白"];
const SOCIAL_KEYWORDS = ["友達", "友人", "飲み会", "ランチ", "食事", "帰省", "家族"];

function eventCategory(title: string, description: string): "daily" | "work" | "school" | "romance" | "social" {
  const hay = `${title} ${description}`.toLowerCase();
  if (WORK_KEYWORDS.some((k) => hay.includes(k))) return "work";
  if (SCHOOL_KEYWORDS.some((k) => hay.includes(k))) return "school";
  if (ROMANCE_KEYWORDS.some((k) => hay.includes(k))) return "romance";
  if (SOCIAL_KEYWORDS.some((k) => hay.includes(k))) return "social";
  return "daily";
}

function timingStatus(start: string, end: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return "all_day";
  const s = Date.parse(start);
  const e = Date.parse(end || start);
  const n = Date.now();
  if (!Number.isFinite(s)) return "upcoming";
  if (n < s) return "upcoming";
  if (n > (Number.isFinite(e) ? e : s)) return "past";
  return "ongoing";
}

export async function runCalendarDailyAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();
  try {
    const userRow = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { settings: true },
    });
    const profile = parseUserSettings(userRow?.settings ?? {}).profile;

    const cal = await fetchCalendarEventsForDay(req.userId, req.entryDateYmd);
    const allEvents = cal.ok ? cal.events : [];

    const dailyEvents = allEvents.filter((ev) => {
      const cat = eventCategory(ev.title, ev.description);
      return cat === "daily";
    });

    const memory = await loadAgentMemory(req.userId, DOMAIN);
    const basePrompt = loadAgentPrompt("calendar-daily");
    const systemPrompt = prependPersonaInstructions(basePrompt, req.persona.instructionText);

    const eventsText =
      dailyEvents.length > 0
        ? dailyEvents
            .slice(0, 5)
            .map((ev) => {
              const timing = timingStatus(ev.start, ev.end);
              const time = ev.start.includes("T")
                ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ev.start))
                : "";
              return `- ${ev.title}${time ? ` ${time}` : ""}（${timing}）${ev.location ? ` @${ev.location}` : ""}`;
            })
            .join("\n")
        : "（当日の一般予定なし）";

    const contextBlock = buildContextBlock({ ...req, agentMemory: memory });
    const userMsg = [
      contextBlock,
      `### 当日の一般予定（バイト・学校・恋愛系を除く）\n${eventsText}`,
      `### オーケストレーターからの質問\n${req.extraContext?.question ?? req.userMessage}`,
    ].join("\n\n");

    const { text, latencyMs } = await callSubAgentLLM({ systemPrompt, userMessage: userMsg, maxTokens: 400 });

    return { agentName: DOMAIN, answer: text, updatedMemory: [], model: "gpt-4o-mini", latencyMs: Date.now() - started };
  } catch (e) {
    return buildErrorResponse(DOMAIN, e);
  }
}
