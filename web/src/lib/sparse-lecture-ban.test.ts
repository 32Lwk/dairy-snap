import { describe, expect, it } from "vitest";
import {
  buildReflectiveOpeningSystemInstruction,
  formatOrchestratorSparseThreadHintBlock,
} from "./time/entry-temporal-context";

describe("薄い日×非時間割: 授業禁止の英語指示", () => {
  it("hasTimetableLecturesToday が false なら Do not mention 授業", () => {
    const s = formatOrchestratorSparseThreadHintBlock({
      isSparseSchedule: true,
      hasTimetableLecturesToday: false,
      occupationRole: "student",
    });
    expect(s).toMatch(/Do not.*mention|授業/);
    expect(s).toContain("何限");
  });

  it("開口指示に Lecture ban と禁止語 授業・講義・何限 が含まる", () => {
    const s = buildReflectiveOpeningSystemInstruction("2026-05-03", new Date("2026-05-03T12:00:00+09:00"), {
      hasDiaryBody: false,
      calendarLinked: true,
      calendarEventCount: 0,
      hasTimetableLecturesToday: false,
      isSparseSchedule: true,
    });
    expect(s).toContain("Lecture ban");
    expect(s).toContain("授業");
    expect(s).toContain("講義");
    expect(s).toContain("何限");
  });
});
