/**
 * ニュース・スポーツ等の専用 API 抽象層（v1 スタブ）。
 * プロバイダ実装時は環境変数でキーを渡し、ここから hobby 経路を呼ぶ。
 *
 * **現状の「ニュースっぽい」手がかり**: `fetchHobbyNewsFromProvider` は常に null。
 * 開口・趣味会話では `hobby-agent` の **Vertex 検索グラウンディング**（設定時）と
 * **許可ドメイン公式抜粋**が主経路。専用ニュース API を足す場合はここに実装する。
 */

export type HobbyNewsSnippet = {
  title: string;
  summaryJa: string;
  sourceUrl: string;
};

/** 将来: Yahoo ニュース API 等。現状は常に null — 開口の「最新話題」は hobby-agent の **Vertex 検索グラウンディング** と **許可ドメイン公式抜粋**が主経路。ここに実装を足すと query_hobby 経由で自動で混ざる。 */
export async function fetchHobbyNewsFromProvider(_params: {
  queryJa: string;
  userId: string;
}): Promise<HobbyNewsSnippet | null> {
  return null;
}
