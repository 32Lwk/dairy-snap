import { describe, expect, it } from "vitest";
import {
  formatJpAnniversaryLocalSystemBlock,
  getJpAnniversaryNamesForYmd,
} from "@/lib/jp-anniversary-local";

describe("jp-anniversary-local", () => {
  it("returns names for a known bundled day", () => {
    const names = getJpAnniversaryNamesForYmd("2026-05-03");
    expect(names).toBeTruthy();
    expect(names!.length).toBeGreaterThan(0);
    expect(names!.some((n) => n.includes("憲法") || n.includes("記念"))).toBe(true);
  });

  it("formats system block", () => {
    const block = formatJpAnniversaryLocalSystemBlock(["テスト記念日"], "2026-05-03", {
      showUserFacingAttribution: false,
    });
    expect(block).toContain("テスト記念日");
    expect(block).toContain("ローカル");
  });
});
