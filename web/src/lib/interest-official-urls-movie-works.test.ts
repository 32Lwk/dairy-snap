import { describe, expect, it } from "vitest";
import { MEDIA_MOVIE_FINES } from "@/lib/interest-taxonomy-fines-media";
import { MOVIE_WORK_OFFICIAL_URLS_BY_PICK_ID } from "@/lib/interest-official-urls-movie-works";

function allMovieWorkPickIds(): string[] {
  const ids: string[] = [];
  for (const fine of MEDIA_MOVIE_FINES) {
    for (const w of fine.works ?? []) {
      ids.push(w.id);
    }
  }
  return ids;
}

describe("MOVIE_WORK_OFFICIAL_URLS_BY_PICK_ID", () => {
  it("taxonomy の映画 works すべてに https の参照先がある（Wikipedia 依存にしない）", () => {
    const expected = allMovieWorkPickIds();
    expect(expected.length).toBeGreaterThan(10);
    for (const id of expected) {
      const urls = MOVIE_WORK_OFFICIAL_URLS_BY_PICK_ID[id];
      expect(urls?.[0], id).toMatch(/^https:\/\//);
      expect(urls![0], id).not.toContain("wikipedia.org");
    }
  });
});
