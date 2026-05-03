import { searchMemoryLongTermBySimilarity, syncMemoryLongTermEmbeddingsForUser } from "@/server/embeddings";

const VECTOR_MIN_SCORE = 0.18;
const VECTOR_MIN_HITS = 1;

/**
 * 「長期プロフィール」セクション向けテキスト（見出しなし）。
 * ベクトルヒットが十分なときは JSON サマリ＋箇条書き、それ以外はレガシー（重要度順の直列き）を返す。
 */
export async function buildLongTermProfileBlockText(
  userId: string,
  userMessageForQuery: string,
  entryDateYmd: string,
  legacyBulletLines: string,
): Promise<string> {
  if (process.env.ORCHESTRATOR_LONG_TERM_VECTOR === "0") {
    return legacyBulletLines;
  }

  const queryCore = `${entryDateYmd} ${userMessageForQuery}`.trim().slice(0, 2000) || entryDateYmd;
  let hits = await searchMemoryLongTermBySimilarity(userId, queryCore, 10);
  const strong = hits.filter((h) => h.score >= VECTOR_MIN_SCORE && h.bullets.length > 0);

  if (strong.length >= VECTOR_MIN_HITS) {
    const cardJson = JSON.stringify(
      strong.slice(0, 8).map((h) => ({
        memoryId: h.id,
        similarity: Math.round(h.score * 1000) / 1000,
        bullets: h.bullets.slice(0, 6),
      })),
    );
    const bulletLines = strong
      .flatMap((h) => h.bullets.slice(0, 4).map((b) => `- ${b}`))
      .join("\n")
      .slice(0, 3500);
    return [
      "（抽出: このターンの発言・エントリ日と長期メモの類似度。参考情報としてのみ用いる）",
      "```json",
      cardJson,
      "```",
      bulletLines || "（該当箇条書きなし）",
    ].join("\n");
  }

  void syncMemoryLongTermEmbeddingsForUser(userId, 24).catch(() => {});
  return legacyBulletLines;
}
