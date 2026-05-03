import { randomUUID } from "node:crypto";
import { getOpenAI } from "@/lib/ai/openai";
import { prisma } from "@/server/db";

const MODEL = "text-embedding-3-small";
const DIM = 1536;

export type EmbeddingTargetType =
  | "DAILY_ENTRY"
  | "GCAL_EVENT"
  | "CHAT_MESSAGE"
  | "ENTRY_APPEND"
  | "MEMORY_LONG_TERM";

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

/** 同一種別の複数 target を1クエリで削除（チャット一括削除など） */
export async function deleteEmbeddingsForTargets(
  userId: string,
  targetType: EmbeddingTargetType,
  targetIds: string[],
) {
  const ids = [...new Set(targetIds)].filter(Boolean);
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `$${i + 3}`).join(", ");
  await prisma.$executeRawUnsafe(
    `DELETE FROM embeddings WHERE "userId" = $1 AND "targetType" = $2 AND "targetId" IN (${placeholders})`,
    userId,
    targetType,
    ...ids,
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

export type MemoryLongTermVectorHit = {
  id: string;
  bullets: string[];
  score: number;
};

/**
 * 長期メモリ行に紐づく埋め込みだけを対象にベクトル近傍検索（オーケストレーター注入用）。
 */
export async function searchMemoryLongTermBySimilarity(
  userId: string,
  query: string,
  limit = 8,
): Promise<MemoryLongTermVectorHit[]> {
  if (process.env.DISABLE_MEMORY_LONG_TERM_EMBEDDINGS === "1") return [];
  const trimmed = query.trim().slice(0, 8000);
  if (!trimmed) return [];
  const vec = await embedText(trimmed);
  const literal = vecToSqlLiteral(vec);

  const rows = await prisma.$queryRawUnsafe<
    { id: string; bullets: unknown; score: string | number }[]
  >(
    `SELECT m.id, m.bullets,
            (1 - (e.vector <=> $1::vector))::float8 AS score
     FROM embeddings e
     INNER JOIN memory_long_term m
       ON m.id = e."targetId" AND m."userId" = e."userId"
     WHERE e."userId" = $2 AND e."targetType" = 'MEMORY_LONG_TERM'
     ORDER BY e.vector <=> $1::vector
     LIMIT $3`,
    literal,
    userId,
    limit,
  );

  return rows.map((r) => {
    const raw = r.bullets;
    const bullets = Array.isArray(raw)
      ? (raw as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    return {
      id: r.id,
      bullets,
      score: typeof r.score === "string" ? parseFloat(r.score) : r.score,
    };
  });
}

/**
 * 重要度上位の長期メモリ行の埋め込みを再生成（新規行・更新後の追従用）。
 */
export async function syncMemoryLongTermEmbeddingsForUser(userId: string, maxRows = 32): Promise<void> {
  if (process.env.DISABLE_MEMORY_LONG_TERM_EMBEDDINGS === "1") return;
  const rows = await prisma.memoryLongTerm.findMany({
    where: { userId },
    orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
    take: maxRows,
    select: { id: true, bullets: true },
  });
  for (const r of rows) {
    const lines = (Array.isArray(r.bullets) ? (r.bullets as string[]) : [])
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    const text = lines.join("\n").slice(0, 8000);
    if (!text) {
      await deleteEmbedding(userId, "MEMORY_LONG_TERM", r.id).catch(() => {});
      continue;
    }
    await upsertTextEmbedding(userId, "MEMORY_LONG_TERM", r.id, text).catch(() => {});
  }
}
