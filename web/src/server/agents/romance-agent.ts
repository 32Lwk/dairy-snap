import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentQualityChatFallbackModel,
  getAgentQualityChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { isLoveMbtiType, loveMbtiDisplayJa, LOVE_MBTI_DETAILS } from "@/lib/love-mbti";
import { isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

function buildRomanceContext(mbti?: string, loveMbti?: string): string {
  const lines: string[] = [];

  if (mbti && isMbtiType(mbti)) {
    lines.push(`MBTI: ${mbtiDisplayJa(mbti)}`);
    const isIntrovert = mbti.startsWith("I");
    const isFeeling = mbti[2] === "F";
    if (isIntrovert) lines.push("内向型: 恋愛の話を急かさず、ゆっくり引き出す。");
    if (isFeeling) lines.push("感情型: 感情の共有・共感を重視した会話スタイルを好む。");
  }

  if (loveMbti && isLoveMbtiType(loveMbti)) {
    const detail = LOVE_MBTI_DETAILS[loveMbti];
    lines.push(`恋愛タイプ: ${loveMbtiDisplayJa(loveMbti)}`);
    lines.push(`特性: ${detail.traitJa}`);
    lines.push(`恋愛傾向: ${detail.loveTendencyJa}`);
    lines.push(`相性が良いタイプ: ${detail.compatibleGoodJa}`);
  }

  return lines.join("\n");
}

export async function runRomanceAgent(req: AgentRequest): Promise<AgentResponse> {
  if (req.persona.avoidTopics.includes("romance")) {
    return { answer: "", hasRelevantInfo: false };
  }

  const { mbti, loveMbti } = req.persona;
  const romanceCtx = buildRomanceContext(mbti, loveMbti);

  if (!romanceCtx && !req.userMessage) {
    return { answer: "", hasRelevantInfo: false };
  }

  const memoryLines = Object.entries(req.agentMemory)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const systemPrompt = loadAgentPrompt("romance");
  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    romanceCtx ? `## ユーザーの恋愛タイプ情報\n${romanceCtx}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    memoryLines ? `## ドメインメモリ（恋愛関係）\n${memoryLines}` : "",
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
  return { answer, hasRelevantInfo: answer.length > 0 };
}
