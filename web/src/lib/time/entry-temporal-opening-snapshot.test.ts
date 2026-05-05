import { describe, expect, it } from "vitest";
import { buildReflectiveOpeningSystemInstruction } from "./entry-temporal-context";

describe("buildReflectiveOpeningSystemInstruction", () => {
  it("時間割アンカーなしでは Lecture ban を含む", () => {
    const s = buildReflectiveOpeningSystemInstruction("2026-05-03", new Date("2026-05-03T12:00:00+09:00"), {
      hasDiaryBody: false,
      calendarLinked: true,
      calendarEventCount: 0,
      hasTimetableLecturesToday: false,
      isSparseSchedule: true,
    });
    expect(s).toContain("Lecture ban");
  });

  it("薄い日・趣味シグナルありでは hobby hook 行を含む", () => {
    const s = buildReflectiveOpeningSystemInstruction("2026-05-03", new Date("2026-05-03T12:00:00+09:00"), {
      hasDiaryBody: false,
      calendarLinked: true,
      calendarEventCount: 0,
      hasTimetableLecturesToday: false,
      isSparseSchedule: true,
      hasInterestSignals: true,
    });
    expect(s).toContain("hobby");
  });

  it("祝日×薄い日×実質予定ゼロでは バイト／外出 のデフォルト二択を禁じる行を含む", () => {
    const s = buildReflectiveOpeningSystemInstruction("2026-05-03", new Date("2026-05-03T12:00:00+09:00"), {
      hasDiaryBody: false,
      calendarLinked: true,
      calendarEventCount: 0,
      hasTimetableLecturesToday: false,
      isSparseSchedule: true,
      holidayNameJa: "憲法記念日",
      occupationRole: "company",
    });
    expect(s).toContain("バイト");
    expect(s).toContain("National holiday");
    expect(s).toContain("student mode in profile");
    expect(s).toContain("祝日メモ（参考）");
  });

  it("飲食予約フラグありでは 就活既定を避け並列質問のダイニングアンカーを含む", () => {
    const s = buildReflectiveOpeningSystemInstruction("2026-05-03", new Date("2026-05-03T12:00:00+09:00"), {
      hasDiaryBody: false,
      calendarLinked: true,
      calendarEventCount: 1,
      hasTimetableLecturesToday: false,
      hasDiningVenueReservationLikePlan: true,
    });
    expect(s).toContain("Dining / venue reservation");
    expect(s).toContain("就活");
    expect(s).toContain("プライベート");
  });
});
