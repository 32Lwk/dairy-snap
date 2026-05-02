import { describe, expect, it } from "vitest";
import {
  countSubstantiveCalendarPlanEvents,
  filterCalendarEventsForAiNationalHolidaySanity,
  filterOutPreviousDayNationalHolidayGhosts,
  getJapaneseHolidayNameJa,
  resolveJapaneseHolidayNameForEntry,
} from "./jp-holiday";

describe("resolveJapaneseHolidayNameForEntry", () => {
  it("国立祝日は内閣府データ（バンドル JSON）を正とする（2026-04-29 は昭和の日）", () => {
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

  it("振替表記の前日祝日タイトルも当日の祝日シグナルにしない", () => {
    expect(resolveJapaneseHolidayNameForEntry("2026-04-30", "昭和の日（振替休日）")).toBeNull();
  });
});

describe("filterOutPreviousDayNationalHolidayGhosts", () => {
  it("4/30 に重なる前日の昭和の日終日イベントをオーケストレータ入力から除く", () => {
    const raw = [
      { start: "2026-04-30", title: "昭和の日", calendarName: "日本の祝日" },
      { start: "2026-04-30T17:00:00+09:00", title: "マツモトキヨシ" },
    ];
    const out = filterOutPreviousDayNationalHolidayGhosts("2026-04-30", raw);
    expect(out).toEqual([raw[1]]);
  });

  it("終了が翌日にまたがる終日の開始日が前日でも同様に除く", () => {
    const raw = [{ start: "2026-04-29", title: "昭和の日", calendarName: "祝日カレンダー" }];
    expect(filterOutPreviousDayNationalHolidayGhosts("2026-04-30", raw)).toEqual([]);
  });
});

describe("filterCalendarEventsForAiNationalHolidaySanity", () => {
  it("名称カタログと日付が合わない国民祝日名の終日イベントは AI 向けから除く（いずれかの段で除去）", () => {
    const raw = [
      { start: "2026-04-30", title: "昭和の日", calendarName: "holiday" },
      { start: "2026-04-30T17:00:00+09:00", title: "マツモトキヨシ" },
    ];
    expect(filterCalendarEventsForAiNationalHolidaySanity("2026-04-30", raw)).toEqual([raw[1]]);
  });
});

describe("countSubstantiveCalendarPlanEvents", () => {
  it("祝日カレンダーの終日のみなら実質件数は 0（薄い日判定用）", () => {
    const events = [
      {
        start: "2026-05-03",
        title: "憲法記念日",
        calendarId: "ja.japanese#holiday@group.v.calendar.google.com",
        calendarName: "日本の祝日(その他)",
      },
    ];
    expect(countSubstantiveCalendarPlanEvents(events, "憲法記念日")).toBe(0);
  });

  it("公式祝日名と一致する終日のみ（一般カレンダー）も実質 0", () => {
    const events = [
      {
        start: "2026-05-03T00:00:00+09:00",
        title: "憲法記念日",
        calendarId: "user@gmail.com",
        calendarName: "自分",
      },
    ];
    expect(countSubstantiveCalendarPlanEvents(events, "憲法記念日")).toBe(0);
  });

  it("祝日終日に加えて時刻付き予定があれば実質 1 以上", () => {
    const events = [
      {
        start: "2026-05-03",
        title: "憲法記念日",
        calendarName: "日本の祝日",
      },
      {
        start: "2026-05-03T14:00:00+09:00",
        title: "買い物",
        calendarName: "自分",
      },
    ];
    expect(countSubstantiveCalendarPlanEvents(events, "憲法記念日")).toBe(1);
  });
});
