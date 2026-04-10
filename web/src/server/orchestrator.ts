/**
 * MAS オーケストレーター
 * OpenAI Tool Calling でサブエージェントを呼び分け、最終回答をストリーミング返却する
 */

import { prisma } from "@/server/db";
import { getOpenAI } from "@/lib/ai/openai";
import { parseUserSettings } from "@/lib/user-settings";
import { formatAgentPersonaForPrompt } from "@/lib/agent-persona-preferences";
import { isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import { isLoveMbtiType, loveMbtiDisplayJa } from "@/lib/love-mbti";
import { loadAgentPrompt } from "@/server/agents/agent-helpers";
import { getWeatherContext } from "@/server/agents/weather-tool";
import { runSchoolAgent } from "@/server/agents/school-agent";
import { runCalendarDailyAgent } from "@/server/agents/calendar-daily-agent";
import { runCalendarWorkAgent } from "@/server/agents/calendar-work-agent";
import { runCalendarSocialAgent } from "@/server/agents/calendar-social-agent";
import { runHobbyAgent } from "@/server/agents/hobby-agent";
import { runRomanceAgent } from "@/server/agents/romance-agent";
import { runSupervisorAgent } from "@/server/agents/supervisor-agent";
import {
  AGENT_TOOL_NAMES,
  AGENT_TOOLS,
  getAvailableTools,
  type AgentRequest,
  type AgentResponse,
  type PersonaContext,
  type MbtiHint,
  type WeatherContext,
} from "@/server/agents/types";
import type { EncryptionMode } from "@/generated/prisma/enums";

function buildPersonaContext(profile: ReturnType<typeof parseUserSettings>["profile"]): PersonaContext {
  const p = profile ?? {};
  const avoidTopics = Array.isArray(p.aiAvoidTopics) ? p.aiAvoidTopics : [];
  const personaLines = formatAgentPersonaForPrompt(p);
  return {
    addressStyle: p.aiAddressStyle ?? "",
    chatTone: p.aiChatTone ?? "",
    depthLevel: p.aiDepthLevel ?? "",
    avoidTopics,
    instructionText: personaLines.join("\n"),
  };
}

function buildMbtiHint(profile: ReturnType<typeof parseUserSettings>["profile"]): MbtiHint {
  const p = profile ?? {};
  const mbti = p.mbti?.trim();
  const loveMbti = p.loveMbti?.trim();
  const styleLines: string[] = [];
  const preferredDomains: string[] = [];

  if (mbti && isMbtiType(mbti)) {
    styleLines.push(`MBTIタイプ: ${mbtiDisplayJa(mbti)}`);
    const e = mbti[0] === "E";
    const f = mbti[2] === "F";
    const j = mbti[3] === "J";
    if (e && f) {
      styleLines.push("外向・感情タイプ: 趣味・人間関係・感情表現を重視する傾向");
      preferredDomains.push("hobby", "social", "romance");
    } else if (!e && !f) {
      styleLines.push("内向・思考タイプ: 分析・目標・学習を重視する傾向");
      preferredDomains.push("school", "work");
    } else if (e) {
      styleLines.push("外向タイプ: 活動・社交を好む傾向");
      preferredDomains.push("hobby", "social");
    } else {
      styleLines.push("内向タイプ: 深い思考・内省を好む傾向");
      preferredDomains.push("school");
    }
    if (!j) {
      preferredDomains.push("hobby");
    }
  }

  if (loveMbti && isLoveMbtiType(loveMbti)) {
    styleLines.push(`恋愛MBTIタイプ: ${loveMbtiDisplayJa(loveMbti)}`);
  }

  return {
    mbti: mbti,
    loveMbti: loveMbti,
    styleHint: styleLines.join(" / "),
    preferredDomains: [...new Set(preferredDomains)],
  };
}

async function getLongTermContext(userId: string): Promise<string> {
  const mems = await prisma.memoryLongTerm.findMany({
    where: { userId },
    orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
    take: 5,
  });
  if (mems.length === 0) return "";
  return mems
    .flatMap((m) => {
      const bullets = Array.isArray(m.bullets) ? m.bullets : [];
      return bullets.map((b) => `- ${String(b)}`);
    })
    .join("\n");
}

async function dispatchToAgent(
  toolName: string,
  toolArguments: Record<string, string>,
  baseReq: AgentRequest,
  weatherCtx: WeatherContext,
): Promise<AgentResponse> {
  const req: AgentRequest = {
    ...baseReq,
    extraContext: { question: toolArguments.question ?? baseReq.userMessage },
  };

  const timeoutMs = 10000;
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("agent timeout")), timeoutMs)),
    ]);

  switch (toolName) {
    case AGENT_TOOL_NAMES.QUERY_WEATHER:
      return {
        agentName: "weather",
        answer: weatherCtx.summary,
        updatedMemory: [],
      };
    case AGENT_TOOL_NAMES.QUERY_SCHOOL:
      return withTimeout(runSchoolAgent(req));
    case AGENT_TOOL_NAMES.QUERY_CALENDAR_DAILY:
      return withTimeout(runCalendarDailyAgent(req));
    case AGENT_TOOL_NAMES.QUERY_CALENDAR_WORK:
      return withTimeout(runCalendarWorkAgent(req));
    case AGENT_TOOL_NAMES.QUERY_CALENDAR_SOCIAL:
      return withTimeout(runCalendarSocialAgent(req));
    case AGENT_TOOL_NAMES.QUERY_HOBBY:
      return withTimeout(runHobbyAgent(req));
    case AGENT_TOOL_NAMES.QUERY_ROMANCE:
      if (baseReq.persona.avoidTopics.includes("romance")) {
        return { agentName: "romance", answer: "", updatedMemory: [], error: "blocked by avoidTopics" };
      }
      return withTimeout(runRomanceAgent(req));
    default:
      return { agentName: "unknown", answer: "", updatedMemory: [], error: `unknown tool: ${toolName}` };
  }
}

export type OrchestratorParams = {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  encryptionMode: EncryptionMode;
  currentBody: string;
  threadId: string;
  conversationHistory: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  userMessage: string;
  isOpening?: boolean;
};

export type OrchestratorResult = {
  assistantText: string;
  agentsUsed: string[];
  weatherCtx: WeatherContext;
  persona: PersonaContext;
};

/**
 * Tool Calling ループを実行し、最終テキストを蓄積して返す（ストリーミング版はルートで処理）
 * isOpening=true の場合は最大 2 エージェントのみ呼び出す
 */
export async function runOrchestrator(
  params: OrchestratorParams,
  onDelta?: (delta: string) => void,
): Promise<OrchestratorResult> {
  const openai = getOpenAI();

  const userRow = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { settings: true },
  });
  const settings = parseUserSettings(userRow?.settings ?? {});
  const profile = settings.profile;

  const persona = buildPersonaContext(profile);
  const mbtiHint = buildMbtiHint(profile);
  const longTermContext = await getLongTermContext(params.userId);

  const weatherCtx = await getWeatherContext(params.userId, params.entryId, params.entryDateYmd);

  const baseReq: AgentRequest = {
    userId: params.userId,
    entryId: params.entryId,
    entryDateYmd: params.entryDateYmd,
    userMessage: params.userMessage,
    agentMemory: [],
    persona,
    mbtiHint,
    longTermContext,
  };

  const availableTools = getAvailableTools(persona.avoidTopics);

  const orchestratorSystemPrompt = loadAgentPrompt("orchestrator");

  const orchestratorContextBlock = [
    `対象日: ${params.entryDateYmd}`,
    `天気: ${weatherCtx.summary}`,
    mbtiHint.styleHint ? `ユーザー特性: ${mbtiHint.styleHint}` : "",
    persona.instructionText ? `ペルソナ指示:\n${persona.instructionText}` : "",
    persona.avoidTopics.length > 0 ? `避けたい話題（query_romance など該当ツールは呼ばない）: ${persona.avoidTopics.join(", ")}` : "",
    params.currentBody && params.encryptionMode === "STANDARD"
      ? `日記本文（文字数参考）: ${params.currentBody.length}字`
      : "",
    longTermContext ? `長期記憶:\n${longTermContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemContent = `${orchestratorSystemPrompt}\n\n## コンテキスト\n${orchestratorContextBlock}`;

  const messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [
    { role: "system", content: systemContent },
    ...params.conversationHistory,
  ];
  if (params.userMessage && !params.isOpening) {
    messages.push({ role: "user", content: params.userMessage });
  }

  const agentsUsed: string[] = [];
  const toolResults: Map<string, string> = new Map();
  let assistantText = "";
  const maxToolRounds = params.isOpening ? 3 : 5;
  let toolRound = 0;

  while (toolRound < maxToolRounds) {
    toolRound++;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
      tools: availableTools,
      tool_choice: "auto",
      stream: false,
      max_tokens: 800,
    });

    {
      const choice = completion.choices[0];
      if (!choice) break;

      const toolCalls = choice.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        assistantText = choice.message.content ?? "";
        if (onDelta && assistantText) onDelta(assistantText);
        break;
      }

      messages.push({ role: "assistant", content: choice.message.content ?? "", ...({ tool_calls: toolCalls } as object) });

      type AnyToolCall = { id: string; function?: { name?: string; arguments?: string } };
      const anyToolCalls = toolCalls as unknown as AnyToolCall[];

      const parallelResults = await Promise.allSettled(
        anyToolCalls.map(async (tc) => {
          const fnName = tc.function?.name ?? "";
          const args = JSON.parse(tc.function?.arguments || "{}") as Record<string, string>;
          const result = await dispatchToAgent(fnName, args, baseReq, weatherCtx);
          if (!agentsUsed.includes(result.agentName)) agentsUsed.push(result.agentName);
          return { id: tc.id, name: fnName, result };
        }),
      );

      for (const settled of parallelResults) {
        if (settled.status === "fulfilled") {
          const { id, name, result } = settled.value;
          const content = result.error ? `（取得失敗: ${result.error}）` : (result.answer || "（情報なし）");
          toolResults.set(id, content);
          messages.push({ role: "tool", content, tool_call_id: id, name });
        } else {
          const tc = anyToolCalls[parallelResults.indexOf(settled)];
          if (tc) {
            messages.push({ role: "tool", content: "（エージェントタイムアウト）", tool_call_id: tc.id, name: tc.function?.name ?? "" });
          }
        }
      }

      if (params.isOpening && agentsUsed.length >= 2) {
        const finalStream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          stream: true,
          max_tokens: 600,
        });
        for await (const part of finalStream) {
          const delta = part.choices[0]?.delta?.content ?? "";
          if (delta) {
            assistantText += delta;
            onDelta?.(delta);
          }
        }
        break;
      }
    }
  }

  if (!assistantText && toolResults.size > 0) {
    const finalCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
      stream: false,
      max_tokens: 600,
    });
    assistantText = finalCompletion.choices[0]?.message?.content ?? "";
    if (onDelta && assistantText) onDelta(assistantText);
  }

  void runSupervisorAgent({
    userId: params.userId,
    threadId: params.threadId,
    agentsUsed,
    conversation: [
      ...params.conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "assistant", content: assistantText },
    ],
    personaUsed: persona,
    weatherUsed: weatherCtx,
  });

  return { assistantText, agentsUsed, weatherCtx, persona };
}
