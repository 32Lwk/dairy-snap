/**
 * ニュース・スポーツ等の専用 API 抽象層（v1 スタブ）。
 * プロバイダ実装時は環境変数でキーを渡し、ここから hobby 経路を呼ぶ。
 */

export type HobbyNewsSnippet = {
  title: string;
  summaryJa: string;
  sourceUrl: string;
};

/** 将来: Yahoo ニュース API 等。現状は常に null（Vertex グラウンディング＋ allowlist GET を主軸）。 */
export async function fetchHobbyNewsFromProvider(_params: {
  queryJa: string;
  userId: string;
}): Promise<HobbyNewsSnippet | null> {
  return null;
}
