import { describe, expect, it } from "vitest";
import {
  collectAllCanonicalInterestPickIds,
  INTEREST_CATEGORIES,
} from "@/lib/interest-taxonomy";
import { DEFAULT_OFFICIAL_URLS_BY_PICK_ID } from "@/lib/interest-official-urls-default";
import { INTEREST_SUB_PORTAL_URL_BY_ID } from "@/lib/interest-sub-portal-urls";

describe("interest official URLs vs taxonomy coverage", () => {
  it("全小分類にポータル URL が定義されている", () => {
    for (const cat of INTEREST_CATEGORIES) {
      for (const sub of cat.subs) {
        expect(INTEREST_SUB_PORTAL_URL_BY_ID[sub.id]).toMatch(/^https:\/\//);
      }
    }
  });

  it("正準 pickId はすべて非空の URL 配列を持つ", () => {
    const all = collectAllCanonicalInterestPickIds();
    expect(all.length).toBeGreaterThan(100);
    for (const id of all) {
      const u = DEFAULT_OFFICIAL_URLS_BY_PICK_ID[id];
      expect(u?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
