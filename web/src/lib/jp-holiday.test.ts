import { describe, expect, it } from "vitest";
import { getJapaneseHolidayNameJa, resolveJapaneseHolidayNameForEntry } from "./jp-holiday";

describe("resolveJapaneseHolidayNameForEntry", () => {
  it("国立祝日はライブラリを正とする（2026-04-29 は昭和の日）", () => {
    expect(getJapaneseHolidayNameJa("2026-04-29")).toBe("昭和の日");
    expect(resolveJapaneseHolidayNameForEntry("2026-04-29", null)).toBe("昭和の日");
  });

  it("前日の祝日タイトルがカレンダーから翌日に誤混入しても当日の祝日にしない", () => {
    expect(getJapaneseHolidayNameJa("2026-04-30")).toBeNull();
    expect(resolveJapaneseHolidayNameForEntry("2026-04-30", "昭和の日")).toBeNull();
  });

  it("当日が祝日でないときのユーザー終日ラベルは残す", () => {
    expect(resolveJapaneseHolidayNameForEntry("2026-04-30", "有給休暇")).toBe("有給休暇");
  });
});
