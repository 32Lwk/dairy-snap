/**
 * MAS エージェント共通ヘルパー
 */

import { prisma } from "@/server/db";
import { getOpenAI } from "@/lib/ai/openai";
import type { AgentMemoryEntry, AgentRequest, AgentResponse } from "@/server/agents/types";
import fs from "node:fs";
import path from "node:path";

/** エージェント用プロンプトファイルを読み込む */
export function loadAgentPrompt(name: string): string {
  const file = path.join(process.cwd(), "prompts", "agents", `${name}.md`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return `# ${name} エージェント\n（プロンプトファイルが見つかりません）`;
  }
}

/** DB から AgentMemory を読み込む */
export async function loadAgentMemory(userId: string, domain: string): Promise<AgentMemoryEntry[]> {
  const rows = await prisma.agentMemory.findMany({
    where: { userId, domain },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({ key: r.memoryKey, value: r.memoryValue, confidence: r.confidence }));
}

/** DB に AgentMemory を upsert する */
export async function saveAgentMemory(
  userId: string,
  domain: string,
  entries: AgentMemoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await Promise.all(
    entries.map((e) =>
      prisma.agentMemory.upsert({
        where: { userId_domain_memoryKey: { userId, domain, memoryKey: e.key } },
        update: { memoryValue: e.value, confidence: e.confidence, updatedAt: new Date() },
        create: {
          userId,
          domain,
          memoryKey: e.key,
          memoryValue: e.value,
          confidence: e.confidence,
        },
      }),
    ),
  );
}

/** ペルソナ指示テキストをシステムプロンプト冒頭に追記する */
export function prependPersonaInstructions(basePrompt: string, personaText: string): string {
  if (!personaText.trim()) return basePrompt;
  return `## ペルソナ・会話スタイル指示（必ず守ること）\n${personaText}\n\n---\n\n${basePrompt}`;
}

/** メモリ配列を読みやすいテキストに変換 */
export function formatMemoryForPrompt(memory: AgentMemoryEntry[]): string {
  if (memory.length === 0) return "（メモリなし）";
  return memory.map((m) => `- ${m.key}: ${m.value}（確信度: ${m.confidence.toFixed(1)}）`).join("\n");
}

/** gpt-4o-mini でサブエージェントの LLM 呼び出しを実行 */
export async function callSubAgentLLM(params: {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<{ text: string; latencyMs: number }> {
  const openai = getOpenAI();
  const started = Date.now();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: params.maxTokens ?? 400,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return { text, latencyMs: Date.now() - started };
}

/** エラー時のフォールバックレスポンスを生成 */
export function buildErrorResponse(agentName: string, error: unknown): AgentResponse {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    agentName,
    answer: "",
    updatedMemory: [],
    error: msg,
  };
}

/** AgentRequest からシステムプロンプト用のコンテキストブロックを生成 */
export function buildContextBlock(req: AgentRequest): string {
  const memBlock = formatMemoryForPrompt(req.agentMemory);
  const parts: string[] = [
    `対象日: ${req.entryDateYmd}`,
    req.longTermContext ? `長期記憶（参考）:\n${req.longTermContext}` : "",
    `このエージェントのメモリ:\n${memBlock}`,
    req.mbtiHint.styleHint ? `ユーザー特性ヒント: ${req.mbtiHint.styleHint}` : "",
    `ユーザーの発言: 「${req.userMessage}」`,
  ];
  return parts.filter(Boolean).join("\n\n");
}
