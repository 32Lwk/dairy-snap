import { prisma } from "@/server/db";
import { parseUserSettings } from "@/lib/user-settings";
import { isLoveMbtiType, getLoveMbtiDetail, loveMbtiDisplayJa, loveMbtiUserPromptSubLines } from "@/lib/love-mbti";
import { isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import type { AgentRequest, AgentResponse } from "@/server/agents/types";
import {
  loadAgentPrompt,
  loadAgentMemory,
  prependPersonaInstructions,
  buildContextBlock,
  callSubAgentLLM,
  buildErrorResponse,
} from "@/server/agents/agent-helpers";

const DOMAIN = "romance";

export async function runRomanceAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();

  if (req.persona.avoidTopics.includes("romance")) {
    return {
      agentName: DOMAIN,
      answer: "",
      updatedMemory: [],
      error: "romance topic is in avoidTopics - agent should not have been called",
    };
  }

  try {
    const userRow = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { settings: true },
    });
    const profile = parseUserSettings(userRow?.settings ?? {}).profile;

    const loveMbtiLines: string[] = [];
    const loveMbti = profile?.loveMbti?.trim();
    if (loveMbti && isLoveMbtiType(loveMbti)) {
      loveMbtiLines.push(`恋愛MBTIタイプ: ${loveMbtiDisplayJa(loveMbti)}`);
      loveMbtiLines.push(...loveMbtiUserPromptSubLines(loveMbti));
    }

    const mbtiLines: string[] = [];
    const mbti = profile?.mbti?.trim();
    if (mbti && isMbtiType(mbti)) {
      mbtiLines.push(`MBTIタイプ: ${mbtiDisplayJa(mbti)}`);
    }

    const memory = await loadAgentMemory(req.userId, DOMAIN);
    const basePrompt = loadAgentPrompt("romance");
    const systemPrompt = prependPersonaInstructions(basePrompt, req.persona.instructionText);

    const personalitySection = [
      ...mbtiLines,
      ...(loveMbtiLines.length > 0 ? ["", "### 恋愛MBTI詳細", ...loveMbtiLines] : []),
    ].join("\n");

    const contextBlock = buildContextBlock({ ...req, agentMemory: memory });
    const userMsg = [
      contextBlock,
      personalitySection ? `### ユーザーの恋愛特性プロフィール\n${personalitySection}` : "",
      `### オーケストレーターからの質問\n${req.extraContext?.question ?? req.userMessage}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text, latencyMs } = await callSubAgentLLM({ systemPrompt, userMessage: userMsg, maxTokens: 400 });

    return { agentName: DOMAIN, answer: text, updatedMemory: [], model: "gpt-4o-mini", latencyMs: Date.now() - started };
  } catch (e) {
    return buildErrorResponse(DOMAIN, e);
  }
}
