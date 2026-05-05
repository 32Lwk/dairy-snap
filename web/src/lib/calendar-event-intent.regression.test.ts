import { describe, expect, it } from "vitest";
import { inferCalendarEventIntent } from "./calendar-event-intent";

describe("calendar intent regressions", () => {
  it("does not mis-frame dining reservation as job hunt", () => {
    const res = inferCalendarEventIntent({
      ev: {
        title: "Reservation at BARBARA",
        start: "2026-05-03T18:00:00+09:00",
        end: "2026-05-03T19:00:00+09:00",
        location: "BARBARA",
        description: "レストラン 予約",
      },
      calendarOpening: null,
      profile: null,
    });
    expect(res.bestCategory).not.toBe("job_hunt");
    // Even when confident, wording must allow private/social framing.
    expect(res.questionTemplateJa).toContain("友人/私用");
  });

  it("opaque proper noun with no details stays confirm-first", () => {
    const res = inferCalendarEventIntent({
      ev: {
        title: "ACME",
        start: "2026-05-03T13:00:00+09:00",
        end: "2026-05-03T14:00:00+09:00",
      },
      calendarOpening: null,
      profile: null,
    });
    expect(res.ambiguityFlags.opaqueTitle).toBe(true);
    expect(res.askStyle).not.toBe("assert_ok");
  });
});

