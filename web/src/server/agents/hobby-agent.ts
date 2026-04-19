import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentQualityChatFallbackModel,
  getAgentQualityChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { parseUserSettings } from "@/lib/user-settings";
import { formatInterestPicksForPrompt } from "@/lib/interest-taxonomy";
import { prisma } from "@/server/db";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

export async function runHobbyAgent(req: AgentRequest): Promise<AgentResponse> {
  const userRow = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { settings: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;

  const hobbies = profile?.hobbies?.trim() ?? "";
  const interests = profile?.interests?.trim() ?? "";
  const pickBlock = formatInterestPicksForPrompt(profile?.interestPicks);
  const memoryLines = Object.entries(req.agentMemory)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const hasAnyHobbyInfo = !!(hobbies || interests || pickBlock);

  const systemPrompt = loadAgentPrompt("hobby");
  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    req.persona.mbtiHint ? `## MBTIヒント\n${req.persona.mbtiHint}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    hobbies ? `## 趣味（自由記述）\n${hobbies}` : "",
    interests ? `## 関心・嗜好\n${interests}` : "",
    pickBlock ? `## 関心タグ（選択）\n${pickBlock}` : "",
    memoryLines ? `## ドメインメモリ\n${memoryLines}` : "",
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!hasAnyHobbyInfo && !req.userMessage) {
    return { answer: "趣味・関心情報なし。", hasRelevantInfo: false };
  }

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
  return { answer, hasRelevantInfo: answer.length > 0 && hasAnyHobbyInfo };
}
