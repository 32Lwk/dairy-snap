import { prisma } from "@/server/db";
import { getOpenAI } from "@/lib/ai/openai";
import type { SupervisorRequest } from "@/server/agents/types";
import { loadAgentPrompt } from "@/server/agents/agent-helpers";

type EvalScores = {
  routingScore: number;
  qualityScore: number;
  personaScore: number;
  notes: {
    routing?: string;
    quality?: string;
    persona?: string;
    suggestions?: string[];
  };
};

function parseEvalScores(text: string): EvalScores {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON found");
    const parsed = JSON.parse(jsonMatch[0]) as Partial<EvalScores>;
    return {
      routingScore: typeof parsed.routingScore === "number" ? Math.min(1, Math.max(0, parsed.routingScore)) : 0.5,
      qualityScore: typeof parsed.qualityScore === "number" ? Math.min(1, Math.max(0, parsed.qualityScore)) : 0.5,
      personaScore: typeof parsed.personaScore === "number" ? Math.min(1, Math.max(0, parsed.personaScore)) : 0.5,
      notes: parsed.notes ?? {},
    };
  } catch {
    return { routingScore: 0.5, qualityScore: 0.5, personaScore: 0.5, notes: { suggestions: ["パース失敗"] } };
  }
}

export async function runSupervisorAgent(req: SupervisorRequest): Promise<void> {
  try {
    const openai = getOpenAI();
    const basePrompt = loadAgentPrompt("supervisor");

    const convText = req.conversation
      .slice(-10)
      .map((m) => `[${m.role}]: ${m.content.slice(0, 300)}`)
      .join("\n");

    const personaSummary = [
      req.personaUsed.addressStyle ? `呼び方: ${req.personaUsed.addressStyle}` : "",
      req.personaUsed.chatTone ? `トーン: ${req.personaUsed.chatTone}` : "",
      req.personaUsed.depthLevel ? `掘り下げ: ${req.personaUsed.depthLevel}` : "",
      req.personaUsed.avoidTopics.length > 0 ? `避けたい話題: ${req.personaUsed.avoidTopics.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    const userMsg = [
      `### 使用エージェント\n${req.agentsUsed.join(", ")}`,
      `### ペルソナ設定\n${personaSummary || "（未設定）"}`,
      req.weatherUsed?.summary ? `### 天気コンテキスト\n${req.weatherUsed.summary}` : "",
      `### 会話ログ（最新10件）\n${convText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [
        { role: "system", content: basePrompt },
        { role: "user", content: userMsg },
      ],
    });

    const responseText = completion.choices[0]?.message?.content?.trim() ?? "";
    const scores = parseEvalScores(responseText);

    await prisma.agentEvaluation.create({
      data: {
        userId: req.userId,
        threadId: req.threadId,
        agentsUsed: req.agentsUsed,
        routingScore: scores.routingScore,
        qualityScore: scores.qualityScore,
        personaScore: scores.personaScore,
        notes: scores.notes as object,
      },
    });
  } catch {
    // スーパーバイザーは非同期・非クリティカルのためエラーは無視
  }
}
