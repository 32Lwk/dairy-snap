import { randomUUID } from "node:crypto";
import { getOpenAI } from "@/lib/ai/openai";
import { prisma } from "@/server/db";

const MODEL = "text-embedding-3-small";
const DIM = 1536;

export type EmbeddingTargetType = "DAILY_ENTRY" | "GCAL_EVENT" | "CHAT_MESSAGE" | "ENTRY_APPEND";

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const input = text.slice(0, 8000);
  const res = await openai.embeddings.create({ model: MODEL, input });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== DIM) {
    throw new Error("embedding dimension mismatch");
  }
  return vec;
}

function vecToSqlLiteral(vec: number[]): string {
  return `[${vec.map((n) => Number(n).toFixed(8)).join(",")}]`;
}

export async function deleteEmbedding(userId: string, targetType: string, targetId: string) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM embeddings WHERE "userId" = $1 AND "targetType" = $2 AND "targetId" = $3`,
    userId,
    targetType,
    targetId,
  );
}

/** 任意テキストをベクトル化して保存（空文字なら行削除） */
export async function upsertTextEmbedding(
  userId: string,
  targetType: EmbeddingTargetType,
  targetId: string,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    await deleteEmbedding(userId, targetType, targetId);
    return;
  }
  const vec = await embedText(trimmed);
  const literal = vecToSqlLiteral(vec);
  const id = randomUUID();

  await prisma.$executeRawUnsafe(
    `DELETE FROM embeddings WHERE "userId" = $1 AND "targetType" = $2 AND "targetId" = $3`,
    userId,
    targetType,
    targetId,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO embeddings (id, "userId", "targetType", "targetId", model, dimensions, vector, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
    id,
    userId,
    targetType,
    targetId,
    MODEL,
    DIM,
    literal,
  );
}

/** daily_entries の本文（STANDARD のみ想定） */
export async function upsertEntryEmbedding(userId: string, entryId: string, body: string) {
  await upsertTextEmbedding(userId, "DAILY_ENTRY", entryId, body);
}

export type VectorHit = {
  id: string;
  targetId: string;
  targetType: string;
  score: number;
};

export async function searchEmbeddings(
  userId: string,
  query: string,
  limit = 10,
): Promise<VectorHit[]> {
  const vec = await embedText(query);
  const literal = vecToSqlLiteral(vec);

  const rows = await prisma.$queryRawUnsafe<
    { id: string; targetId: string; targetType: string; score: string | number }[]
  >(
    `SELECT id, "targetId", "targetType",
            (1 - (vector <=> $1::vector))::float8 AS score
     FROM embeddings
     WHERE "userId" = $2
     ORDER BY vector <=> $1::vector
     LIMIT $3`,
    literal,
    userId,
    limit,
  );

  return rows.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    targetType: r.targetType,
    score: typeof r.score === "string" ? parseFloat(r.score) : r.score,
  }));
}
