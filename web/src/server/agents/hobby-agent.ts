import { prisma } from "@/server/db";
import { parseUserSettings } from "@/lib/user-settings";
import { formatInterestPicksForPrompt } from "@/lib/interest-taxonomy";
import type { AgentRequest, AgentResponse } from "@/server/agents/types";
import {
  loadAgentPrompt,
  loadAgentMemory,
  prependPersonaInstructions,
  buildContextBlock,
  callSubAgentLLM,
  buildErrorResponse,
} from "@/server/agents/agent-helpers";

const DOMAIN = "hobby";

export async function runHobbyAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();
  try {
    const userRow = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { settings: true },
    });
    const profile = parseUserSettings(userRow?.settings ?? {}).profile;

    const hobbies = profile?.hobbies?.trim() ?? "";
    const interests = profile?.interests?.trim() ?? "";
    const interestPicksText = formatInterestPicksForPrompt(profile?.interestPicks);

    const memory = await loadAgentMemory(req.userId, DOMAIN);
    const basePrompt = loadAgentPrompt("hobby");
    const systemPrompt = prependPersonaInstructions(basePrompt, req.persona.instructionText);

    const profileSection = [
      hobbies ? `趣味: ${hobbies}` : "",
      interests ? `関心: ${interests}` : "",
      interestPicksText ? `関心タグ:\n${interestPicksText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const contextBlock = buildContextBlock({ ...req, agentMemory: memory });
    const userMsg = [
      contextBlock,
      profileSection ? `### ユーザーの趣味・関心プロフィール\n${profileSection}` : "### ユーザーの趣味・関心プロフィール\n（未登録）",
      `### MBTIルーティングヒント\n${req.mbtiHint.styleHint || "なし"}`,
      `### オーケストレーターからの質問\n${req.extraContext?.question ?? req.userMessage}`,
    ].join("\n\n");

    const { text, latencyMs } = await callSubAgentLLM({ systemPrompt, userMessage: userMsg, maxTokens: 400 });

    return { agentName: DOMAIN, answer: text, updatedMemory: [], model: "gpt-4o-mini", latencyMs: Date.now() - started };
  } catch (e) {
    return buildErrorResponse(DOMAIN, e);
  }
}
