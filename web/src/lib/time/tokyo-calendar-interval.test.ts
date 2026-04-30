import { describe, expect, it } from "vitest";
import { tokyoCalendarDayEndExclusive, tokyoCalendarDayOverlapsCachedEvent, tokyoCalendarDayStart } from "./tokyo-calendar-interval";

describe("tokyoCalendarDay* (Google 終日の排他終端と Prisma 日次クエリ)", () => {
  it("単日終日（昭和の日）は当日に含まれ、翌日には含まれない", () => {
    const showaStart = tokyoCalendarDayStart("2026-04-29");
    const showaEndExclusive = tokyoCalendarDayStart("2026-04-30");

    expect(tokyoCalendarDayOverlapsCachedEvent("2026-04-29", showaStart, showaEndExclusive)).toBe(true);
    expect(tokyoCalendarDayOverlapsCachedEvent("2026-04-30", showaStart, showaEndExclusive)).toBe(false);
  });

  it("境界: 終了が翌日 0 時ちょうどでも翌日に食い込まない", () => {
    const start = tokyoCalendarDayStart("2026-04-29");
    const end = tokyoCalendarDayEndExclusive("2026-04-29");
    expect(end.getTime()).toBe(tokyoCalendarDayStart("2026-04-30").getTime());
    expect(tokyoCalendarDayOverlapsCachedEvent("2026-04-30", start, end)).toBe(false);
  });

  it("複日終日は中間日にも重なる", () => {
    const start = tokyoCalendarDayStart("2026-04-29");
    const end = tokyoCalendarDayStart("2026-05-02");
    expect(tokyoCalendarDayOverlapsCachedEvent("2026-04-30", start, end)).toBe(true);
    expect(tokyoCalendarDayOverlapsCachedEvent("2026-05-01", start, end)).toBe(true);
    expect(tokyoCalendarDayOverlapsCachedEvent("2026-05-02", start, end)).toBe(false);
  });
});
