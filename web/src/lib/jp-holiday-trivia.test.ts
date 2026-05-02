import { describe, expect, it } from "vitest";
import { triviaLineForJapaneseHoliday } from "./jp-holiday-trivia";

describe("triviaLineForJapaneseHoliday", () => {
  it("登録祝日は短文を返す", () => {
    const s = triviaLineForJapaneseHoliday("元日");
    expect(s).toBeTruthy();
    expect(s!.length).toBeGreaterThan(10);
  });

  it("未登録は null", () => {
    expect(triviaLineForJapaneseHoliday("存在しない祝日名")).toBeNull();
  });

  it("括弧付きや略式でも内蔵キーに寄せて返す", () => {
    expect(triviaLineForJapaneseHoliday("憲法記念日（振替休日）")).toContain("憲法");
    expect(triviaLineForJapaneseHoliday("憲法記念日")).toContain("憲法");
  });
});
