import { MEDIA_ANIME_FINES } from "@/lib/interest-taxonomy-media-anime";

/** アニメ作品チップ id から表示ラベル（AniList 検索用） */
export function labelForAnimeInterestPickId(pickId: string): string | undefined {
  for (const fine of MEDIA_ANIME_FINES) {
    for (const w of fine.works ?? []) {
      if (w.id === pickId) return w.label;
    }
  }
  return undefined;
}
