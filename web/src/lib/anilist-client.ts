/**
 * AniList GraphQL（無料）。公式 URL 補完用。
 */

const ENDPOINT = "https://graphql.anilist.co";

type AniListMediaSearchResponse = {
  data?: {
    Page?: {
      media?: { siteUrl?: string | null }[];
    };
  };
};

export async function anilistFirstAnimeSiteUrl(searchTitle: string): Promise<string | null> {
  const q = searchTitle.trim();
  if (!q) return null;

  const query = `
    query ($s: String) {
      Page(page: 1, perPage: 1) {
        media(search: $s, type: ANIME) {
          siteUrl
        }
      }
    }
  `;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables: { s: q } }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as AniListMediaSearchResponse;
    const url = json.data?.Page?.media?.[0]?.siteUrl?.trim();
    return url || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
