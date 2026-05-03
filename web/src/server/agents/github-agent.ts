import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentQualityChatFallbackModel,
  getAgentQualityChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { prisma } from "@/server/db";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";
import { loadGithubOrchestratorBlock } from "@/server/github/prompt-context";

export async function runGithubAgent(req: AgentRequest): Promise<AgentResponse> {
  const [snap, block] = await Promise.all([
    prisma.gitHubDailySnapshot.findUnique({
      where: { userId_dateYmd: { userId: req.userId, dateYmd: req.entryDateYmd } },
      select: { summary: true },
    }),
    loadGithubOrchestratorBlock(req.userId, req.entryDateYmd),
  ]);

  if (!block) {
    return {
      answer: "GitHub は未連携か、データがありません。",
      hasRelevantInfo: false,
    };
  }

  const summaryJson =
    snap?.summary && typeof snap.summary === "object" && !Array.isArray(snap.summary)
      ? JSON.stringify(snap.summary)
      : "{}";

  const systemPrompt = loadAgentPrompt("github");
  const userBlock = [
    block,
    "",
    "## snapshot_json（参考）",
    summaryJson.slice(0, 4000),
    "",
    req.userMessage ? `## focus / ユーザー発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const openai = getOpenAI();
  const completion = await withChatModelFallback(
    getAgentQualityChatModel(),
    getAgentQualityChatFallbackModel(),
    (model) =>
      openai.chat.completions.create({
        model,
        ...chatCompletionOutputTokenLimit(model, 500),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userBlock },
        ],
      }),
  );

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  return {
    answer: answer || "（GitHub 要約を生成できませんでした）",
    hasRelevantInfo: answer.length > 8,
  };
}
