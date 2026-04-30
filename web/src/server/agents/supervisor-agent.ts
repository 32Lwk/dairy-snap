import { getOpenAI } from "@/lib/ai/openai";
import { prisma } from "@/server/db";
import type { SupervisorRequest } from "./types";
import { loadAgentPrompt } from "./utils";

type EvalScores = {
  routingScore: number;
  qualityScore: number;
  personaScore: number;
  notes: Record<string, string>;
};

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

export async function runSupervisorAgent(req: SupervisorRequest): Promise<void> {
  const systemPrompt = loadAgentPrompt("supervisor");

  const conversationText = req.recentMessages
    .slice(-6)
    .map((m) => `[${m.role}] ${m.content}`)
    .join("\n");

  const contextBlock = [
    `## 使用エージェント\n${req.agentsUsed.join(", ")}`,
    `## ペルソナ指示\n${req.personaInstructions}`,
    req.mbtiHint ? `## MBTIヒント\n${req.mbtiHint}` : "",
    `## 会話（最新${Math.min(req.recentMessages.length, 6)}ターン）\n${conversationText}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextBlock },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Partial<EvalScores> = {};
    try {
      parsed = JSON.parse(raw) as Partial<EvalScores>;
    } catch {
      parsed = {};
    }

    await prisma.agentEvaluation.create({
      data: {
        userId: req.userId,
        threadId: req.threadId,
        agentsUsed: req.agentsUsed,
        routingScore: clamp01(parsed.routingScore),
        qualityScore: clamp01(parsed.qualityScore),
        personaScore: clamp01(parsed.personaScore),
        notes: (parsed.notes as Record<string, string>) ?? {},
      },
    });
  } catch {
    // スーパーバイザーの失敗はサイレントに無視（ユーザー体験に影響させない）
  }
}
