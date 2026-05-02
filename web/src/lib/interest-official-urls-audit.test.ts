import { describe, expect, it } from "vitest";
import { collectAllCanonicalInterestPickIds } from "@/lib/interest-taxonomy";
import { DEFAULT_OFFICIAL_URLS_BY_PICK_ID } from "@/lib/interest-official-urls-default";
import { INTEREST_SUB_PORTAL_URL_BY_ID } from "@/lib/interest-sub-portal-urls";

const HTTPS = /^https:\/\/.+/i;

describe("interest official URLs — 静的監査", () => {
  it("正準 pickId と中央マップのキーが完全一致し、いずれも非空・https のみ", () => {
    const canonical = collectAllCanonicalInterestPickIds();
    const keys = Object.keys(DEFAULT_OFFICIAL_URLS_BY_PICK_ID).sort();
    expect(keys).toEqual([...canonical].sort());

    for (const id of canonical) {
      const urls = DEFAULT_OFFICIAL_URLS_BY_PICK_ID[id];
      expect(urls.length, id).toBeGreaterThan(0);
      for (const u of urls) {
        expect(u, id).toMatch(HTTPS);
        expect(u, id).not.toMatch(/^http:\/\//i);
      }
    }
  });

  it("小分類ポータルもすべて https", () => {
    for (const [subId, u] of Object.entries(INTEREST_SUB_PORTAL_URL_BY_ID)) {
      expect(u, subId).toMatch(HTTPS);
      expect(u, subId).not.toMatch(/^http:\/\//i);
    }
  });

  it("参照 URL に javascript: や空文字が混ざらない", () => {
    for (const [id, urls] of Object.entries(DEFAULT_OFFICIAL_URLS_BY_PICK_ID)) {
      for (const u of urls) {
        expect(u.trim(), id).toBe(u);
        expect(u, id).not.toContain("javascript:");
      }
    }
  });
});
