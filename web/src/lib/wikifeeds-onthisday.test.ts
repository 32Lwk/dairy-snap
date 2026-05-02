import { describe, expect, it } from "vitest";
import { formatOnThisDaySystemBlock, type WikifeedsOnThisDayResult } from "./wikifeeds-onthisday";

describe("formatOnThisDaySystemBlock", () => {
  it("帰属トグルで文言が切り替わる", () => {
    const r: WikifeedsOnThisDayResult = {
      wikiLangUsed: "en",
      lines: ["1. Foo"],
      rawTitles: ["Foo"],
    };
    const off = formatOnThisDaySystemBlock(r, "2026-05-03", { showUserFacingAttribution: false });
    const on = formatOnThisDaySystemBlock(r, "2026-05-03", { showUserFacingAttribution: true });
    expect(off).toContain("会話本文に出典URL");
    expect(on).toContain("オーケストレーター方針");
    expect(on).toContain("Wikipedia / Wikimedia");
  });
});
