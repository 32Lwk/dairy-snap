import { describe, expect, it } from "vitest";
import { hasInterestProfileSignals, isSparseSchedule } from "./opening-sparse-schedule";

describe("isSparseSchedule", () => {
  it("カレンダー未連携かつ時間割アンカーなしは薄い日", () => {
    expect(
      isSparseSchedule({
        calendarLinked: false,
        calendarEventCount: 0,
        hasTimetableLecturesToday: false,
      }),
    ).toBe(true);
  });

  it("イベントがあれば薄い日ではない", () => {
    expect(
      isSparseSchedule({
        calendarLinked: true,
        calendarEventCount: 1,
        hasTimetableLecturesToday: false,
      }),
    ).toBe(false);
  });

  it("時間割アンカーがあれば薄い日ではない", () => {
    expect(
      isSparseSchedule({
        calendarLinked: true,
        calendarEventCount: 0,
        hasTimetableLecturesToday: true,
      }),
    ).toBe(false);
  });
});

describe("hasInterestProfileSignals", () => {
  it("interestPicks があれば true", () => {
    expect(hasInterestProfileSignals({ interestPicks: ["a:b"] })).toBe(true);
  });

  it("空オブジェクトは false", () => {
    expect(hasInterestProfileSignals({})).toBe(false);
  });
});
