import { describe, expect, it } from "vitest";
import { DEFAULT_OFFICIAL_URLS_BY_PICK_ID } from "./interest-official-urls-default";
import { collectAllCanonicalInterestPickIds } from "./interest-taxonomy";
import { MEDIA_ANIME_FINES } from "./interest-taxonomy-media-anime";

describe("DEFAULT_OFFICIAL_URLS_BY_PICK_ID", () => {
  it("タクソノミー上の正準 pickId には少なくとも1件の既定 URL がある", () => {
    for (const id of collectAllCanonicalInterestPickIds()) {
      expect(DEFAULT_OFFICIAL_URLS_BY_PICK_ID).toHaveProperty(id);
      const urls = DEFAULT_OFFICIAL_URLS_BY_PICK_ID[id];
      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBeGreaterThan(0);
      expect(urls[0]).toMatch(/^https:\/\//);
    }
  });

  it("アニメ works は引き続きキーを持ち、キュレーション済みは公式ドメインを優先", () => {
    for (const fine of MEDIA_ANIME_FINES) {
      for (const w of fine.works ?? []) {
        expect(DEFAULT_OFFICIAL_URLS_BY_PICK_ID[w.id].length).toBeGreaterThan(0);
      }
    }
    expect(DEFAULT_OFFICIAL_URLS_BY_PICK_ID["media:anime:late_night:t_jujutsu"][0]).toContain("jujutsukaisen");
  });

  it("アニメ作品チップ（*:t_*）の既定 URL に Wikipedia を使わない", () => {
    for (const [id, urls] of Object.entries(DEFAULT_OFFICIAL_URLS_BY_PICK_ID)) {
      if (!/^media:anime:[^:]+:t_[a-z0-9_]+$/.test(id)) continue;
      for (const u of urls) {
        expect(u, id).not.toContain("wikipedia.org");
      }
    }
  });
});
