/**
 * MAS オーケストレーター
 * gpt-4o が Tool Calling でサブエージェントを呼び分け、最終回答をストリーミング生成する
 */
import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources";
import { getOpenAI } from "@/lib/ai/openai";
import { parseUserSettings } from "@/lib/user-settings";
import { formatAgentPersonaForPrompt } from "@/lib/agent-persona-preferences";
import { isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import { isLoveMbtiType, loveMbtiDisplayJa } from "@/lib/love-mbti";
import { prisma } from "@/server/db";
import { fetchCalendarEventsForDay } from "@/server/calendar";
import { formatYmdWithTokyoWeekday } from "@/lib/timetable";
import { loadAgentPrompt } from "@/server/agents/utils";
import { getWeatherContext, formatWeatherForPrompt } from "@/server/agents/weather-tool";
import { runSchoolAgent } from "@/server/agents/school-agent";
import { runCalendarDailyAgent } from "@/server/agents/calendar-daily-agent";
import { runCalendarWorkAgent } from "@/server/agents/calendar-work-agent";
import { runCalendarSocialAgent } from "@/server/agents/calendar-social-agent";
import { runHobbyAgent } from "@/server/agents/hobby-agent";
import { runRomanceAgent } from "@/server/agents/romance-agent";
import { runSupervisorAgent } from "@/server/agents/supervisor-agent";
import type { AgentRequest, PersonaContext, WeatherContext } from "@/server/agents/types";
import { ORCHESTRATOR_TOOLS } from "@/server/agents/types";

// ─── MBTI ルーティングヒント生成 ─────────────────────────────────────────

function buildMbtiHint(mbti?: string, loveMbti?: string): string {
  const hints: string[] = [];

  if (mbti && isMbtiType(mbti)) {
    hints.push(`MBTI: ${mbtiDisplayJa(mbti)}`);
    const isE = mbti.startsWith("E");
    const isF = mbti[2] === "F";
    const isJ = mbti[3] === "J";
    const isP = mbti[3] === "P";
    if (isE && isF) hints.push("外向・感情型: 趣味・人間関係・恋愛の話題を積極的に取り上げてよい。");
    else if (!isE && !isF) hints.push("内向・思考型: 事実・論理・目標の話を好む。感情の話は相手から話してくれるのを待つ。");
    else if (isE) hints.push("外向型: 積極的な会話・体験談を歓迎する。");
    else hints.push("内向型: 深い話を好むが、急かさない。");
    if (isJ) hints.push("判断型: 計画・目標・振り返りの構造を好む。");
    if (isP) hints.push("知覚型: 即興・体験・新発見の話を好む。");
  }

  if (loveMbti && isLoveMbtiType(loveMbti)) {
    hints.push(`恋愛タイプ: ${loveMbtiDisplayJa(loveMbti)}`);
  }

  return hints.join(" ") || "";
}

// ─── エージェントメモリ取得 ─────────────────────────────────────────────

async function loadAgentMemory(userId: string, domain: string): Promise<Record<string, string>> {
  const rows = await prisma.agentMemory.findMany({
    where: { userId, domain },
    select: { memoryKey: true, memoryValue: true },
  });
  return Object.fromEntries(rows.map((r) => [r.memoryKey, r.memoryValue]));
}

async function saveAgentMemory(
  userId: string,
  domain: string,
  updates: Record<string, string>,
): Promise<void> {
  for (const [memoryKey, memoryValue] of Object.entries(updates)) {
    await prisma.agentMemory.upsert({
      where: { userId_domain_memoryKey: { userId, domain, memoryKey } },
      create: { userId, domain, memoryKey, memoryValue },
      update: { memoryValue },
    });
  }
}

// ─── 長期記憶取得 ────────────────────────────────────────────────────────

async function loadLongTermContext(userId: string): Promise<string> {
  const memories = await prisma.memoryLongTerm.findMany({
    where: { userId },
    orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: { bullets: true },
  });
  if (memories.length === 0) return "";
  const lines = memories
    .flatMap((m) => (Array.isArray(m.bullets) ? (m.bullets as string[]) : []))
    .slice(0, 10);
  return lines.map((l) => `- ${l}`).join("\n");
}

// ─── カレンダー連携確認 ──────────────────────────────────────────────────

async function hasCalendarIntegration(userId: string, entryDateYmd: string): Promise<boolean> {
  try {
    const result = await fetchCalendarEventsForDay(userId, entryDateYmd);
    return result.ok;
  } catch {
    return false;
  }
}

// ─── scoreOpeningTopic プリフィルター ────────────────────────────────────

type OpeningHint = {
  recommendedAgents: string[];
  openingNote: string;
};

function buildOpeningHint(
  occupationRole: string | undefined,
  hasCalendar: boolean,
  weather: WeatherContext,
  persona: PersonaContext,
): OpeningHint {
  const agents: string[] = [];
  const notes: string[] = [];

  if (weather.source !== "none") {
    notes.push(weather.narrativeHint ?? "");
  }

  if (hasCalendar) {
    agents.push("query_calendar_daily");
  }

  if (occupationRole === "student") {
    agents.push("query_school");
  } else if (occupationRole) {
    agents.push("query_calendar_work");
  }

  const mbti = persona.mbti ?? "";
  const isEF = mbti.startsWith("E") && mbti[2] === "F";
  if (isEF) {
    agents.push("query_hobby");
  }

  if (!persona.avoidTopics.includes("romance") && persona.loveMbti) {
    // 恋愛エージェントは開口よりもユーザーが話題を出してから呼ぶ
  }

  return {
    recommendedAgents: [...new Set(agents)],
    openingNote: notes.filter(Boolean).join(" "),
  };
}

// ─── ツール実行 ──────────────────────────────────────────────────────────

type AgentCallArgs = {
  req: AgentRequest;
  domain: string;
  userId: string;
  runFn: (r: AgentRequest) => Promise<{ answer: string; hasRelevantInfo: boolean; updatedMemory?: Record<string, string> }>;
};

async function callAgent({ req, domain, userId, runFn }: AgentCallArgs): Promise<string> {
  try {
    const result = await runFn(req);
    if (result.updatedMemory && Object.keys(result.updatedMemory).length > 0) {
      await saveAgentMemory(userId, domain, result.updatedMemory).catch(() => {});
    }
    return result.answer || "（該当情報なし）";
  } catch (e) {
    return `（エージェントエラー: ${String(e).slice(0, 80)}）`;
  }
}

// ─── メイン: オーケストレーター実行 ─────────────────────────────────────

export type OrchestratorParams = {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  userMessage: string;
  historyMessages: { role: "user" | "assistant"; content: string }[];
  isOpening: boolean;
  encryptionMode: string;
  currentBody: string;
};

export type OrchestratorResult = {
  stream: Stream<ChatCompletionChunk>;
  agentsUsed: string[];
  personaInstructions: string;
  mbtiHint: string;
  threadId?: string;
};

export async function runOrchestrator(params: OrchestratorParams): Promise<OrchestratorResult> {
  const {
    userId,
    entryId,
    entryDateYmd,
    userMessage,
    historyMessages,
    isOpening,
  } = params;

  // ── ユーザー設定読み込み ──
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;

  // ── ペルソナ構築 ──
  const personaLines = formatAgentPersonaForPrompt({
    aiAddressStyle: profile?.aiAddressStyle,
    aiChatTone: profile?.aiChatTone,
    aiDepthLevel: profile?.aiDepthLevel,
    aiEnergyPeak: profile?.aiEnergyPeak,
    aiBusyWindows: profile?.aiBusyWindows,
    aiAvoidTopics: profile?.aiAvoidTopics,
    aiCurrentFocus: profile?.aiCurrentFocus,
    aiHealthComfort: profile?.aiHealthComfort,
    aiHousehold: profile?.aiHousehold,
  });
  const personaInstructions = personaLines.join("\n");
  const avoidTopics = profile?.aiAvoidTopics ?? [];
  const mbti = profile?.mbti;
  const loveMbti = profile?.loveMbti;
  const mbtiHint = buildMbtiHint(mbti, loveMbti);
  const corrections = profile?.aiCorrections ?? [];

  const persona: PersonaContext = {
    instructions: personaInstructions,
    avoidTopics,
    mbti,
    loveMbti,
    mbtiHint: mbtiHint || undefined,
    corrections: corrections.length > 0 ? corrections : undefined,
  };

  // ── 長期記憶 ──
  const longTermContext = await loadLongTermContext(userId);

  // ── 天気情報 ──
  const weather = await getWeatherContext({ userId, entryId, entryDateYmd }).catch(
    (): WeatherContext => ({
      dateYmd: entryDateYmd,
      amLabel: "不明",
      amTempC: null,
      pmLabel: "不明",
      pmTempC: null,
      source: "none",
    }),
  );
  const weatherText = formatWeatherForPrompt(weather);

  // ── カレンダー連携確認 ──
  const calendarAvailable = await hasCalendarIntegration(userId, entryDateYmd);

  // ── 開口ヒント（scoreOpeningTopic 代替） ──
  const openingHint = buildOpeningHint(
    profile?.occupationRole,
    calendarAvailable,
    weather,
    persona,
  );

  // ── オーケストレーターシステムプロンプト ──
  const baseSystem = loadAgentPrompt("orchestrator");
  const systemBlocks = [
    baseSystem,
    "",
    "## ペルソナ指示（最優先で遵守）",
    personaInstructions || "（未設定）",
    "",
    mbtiHint ? `## MBTIヒント\n${mbtiHint}` : "",
    corrections.length > 0
      ? `## ユーザーの訂正メモ（断定を避けること）\n${corrections.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    "## 今日の天気",
    weatherText,
    "",
    `## 対象日\n${formatYmdWithTokyoWeekday(entryDateYmd)}`,
    "",
    isOpening && openingHint.openingNote
      ? `## 開口のヒント\n${openingHint.openingNote}`
      : "",
    isOpening && openingHint.recommendedAgents.length > 0
      ? `## 推奨エージェント（開口時優先）\n${openingHint.recommendedAgents.join(", ")}`
      : "",
    "",
    !calendarAvailable ? "※ Google カレンダー未連携。カレンダー系ツールは呼ばない。" : "",
    profile?.occupationRole !== "student"
      ? "※ 学生ではないため query_school は呼ばない。"
      : "",
    avoidTopics.includes("romance")
      ? "※ ユーザーが恋愛の話題を避けたいため query_romance は絶対に呼ばない。"
      : "",
    longTermContext ? `## 長期記憶（参考）\n${longTermContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ── OpenAI ツール絞り込み ──
  const allowedTools = ORCHESTRATOR_TOOLS.filter((t) => {
    const name = t.function.name;
    if (name === "query_romance" && avoidTopics.includes("romance")) return false;
    if (name === "query_school" && profile?.occupationRole !== "student") return false;
    if (
      (name === "query_calendar_daily" ||
        name === "query_calendar_work" ||
        name === "query_calendar_social") &&
      !calendarAvailable
    )
      return false;
    return true;
  });

  const openai = getOpenAI();
  const agentsUsed: string[] = [];

  // ── Tool Calling ループ ──
  const messages: { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string }[] = [
    { role: "system", content: systemBlocks },
    ...historyMessages,
  ];

  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  } else if (isOpening) {
    messages.push({
      role: "user",
      content: "（会話はまだ始まっていません。あなたから今日の振り返りの最初の一言を日本語で短く送ってください。）",
    });
  }

  // ── 非ストリーミングで Tool Calling ループを回す ──
  let loopCount = 0;
  while (loopCount < 3) {
    loopCount++;

    const nonStreamRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
      tools: allowedTools as Parameters<typeof openai.chat.completions.create>[0]["tools"],
      tool_choice: loopCount === 1 ? "auto" : "none",
      max_tokens: 800,
    });

    const choice = nonStreamRes.choices[0];
    if (!choice) break;

    const assistantMsg = choice.message;
    messages.push({
      role: "assistant",
      content: assistantMsg.content ?? "",
      ...(assistantMsg.tool_calls ? { tool_calls: assistantMsg.tool_calls } as unknown as object : {}),
    });

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) break;

    // 並列でツールを実行
    const toolCallPromises = assistantMsg.tool_calls.map(async (tc) => {
      // ChatCompletionMessageFunctionToolCall のみ扱う（CustomToolCall は無視）
      if (!("function" in tc)) {
        return { tool_call_id: tc.id, content: "（未対応のツール形式）" };
      }
      const toolName = (tc as { id: string; function: { name: string; arguments: string } }).function.name;
      agentsUsed.push(toolName);

      let args: { focus?: string } = {};
      try {
        args = JSON.parse((tc as { id: string; function: { name: string; arguments: string } }).function.arguments || "{}") as { focus?: string };
      } catch {
        args = {};
      }

      const baseReq: AgentRequest = {
        userId,
        entryId,
        entryDateYmd,
        userMessage: args.focus ?? userMessage,
        persona,
        longTermContext: longTermContext || undefined,
        agentMemory: {},
      };

      let toolResult = "";

      if (toolName === "query_weather") {
        toolResult = weatherText;
      } else if (toolName === "query_school") {
        const mem = await loadAgentMemory(userId, "school");
        toolResult = await callAgent({
          req: { ...baseReq, agentMemory: mem },
          domain: "school",
          userId,
          runFn: runSchoolAgent,
        });
      } else if (toolName === "query_calendar_daily") {
        const mem = await loadAgentMemory(userId, "calendar_daily");
        toolResult = await callAgent({
          req: { ...baseReq, agentMemory: mem },
          domain: "calendar_daily",
          userId,
          runFn: runCalendarDailyAgent,
        });
      } else if (toolName === "query_calendar_work") {
        const mem = await loadAgentMemory(userId, "calendar_work");
        toolResult = await callAgent({
          req: { ...baseReq, agentMemory: mem },
          domain: "calendar_work",
          userId,
          runFn: runCalendarWorkAgent,
        });
      } else if (toolName === "query_calendar_social") {
        const mem = await loadAgentMemory(userId, "calendar_social");
        toolResult = await callAgent({
          req: { ...baseReq, agentMemory: mem },
          domain: "calendar_social",
          userId,
          runFn: runCalendarSocialAgent,
        });
      } else if (toolName === "query_hobby") {
        const mem = await loadAgentMemory(userId, "hobby");
        toolResult = await callAgent({
          req: { ...baseReq, agentMemory: mem },
          domain: "hobby",
          userId,
          runFn: runHobbyAgent,
        });
      } else if (toolName === "query_romance") {
        if (!avoidTopics.includes("romance")) {
          const mem = await loadAgentMemory(userId, "romance");
          toolResult = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "romance",
            userId,
            runFn: runRomanceAgent,
          });
        } else {
          toolResult = "（恋愛トピックは除外設定済み）";
        }
      } else {
        toolResult = "（未対応のツール）";
      }

      return { tool_call_id: tc.id, content: toolResult };
    });

    const toolResults = await Promise.all(toolCallPromises);
    for (const tr of toolResults) {
      messages.push({ role: "tool", content: tr.content, tool_call_id: tr.tool_call_id });
    }
  }

  // ── 最終ストリーミング応答 ──
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
    max_tokens: 600,
  });

  return { stream, agentsUsed: [...new Set(agentsUsed)], personaInstructions, mbtiHint };
}

// ─── スーパーバイザー非同期起動 ─────────────────────────────────────────

export function triggerSupervisorAsync(params: {
  userId: string;
  threadId: string;
  agentsUsed: string[];
  recentMessages: { role: string; content: string }[];
  personaInstructions: string;
  mbtiHint?: string;
}): void {
  runSupervisorAgent({
    userId: params.userId,
    threadId: params.threadId,
    agentsUsed: params.agentsUsed,
    recentMessages: params.recentMessages,
    personaInstructions: params.personaInstructions,
    mbtiHint: params.mbtiHint,
  }).catch(() => {});
}
