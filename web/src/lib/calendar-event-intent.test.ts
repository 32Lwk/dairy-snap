import { describe, expect, it } from "vitest";
import { inferCalendarEventIntent } from "./calendar-event-intent";

describe("inferCalendarEventIntent", () => {
  it("Reservation at + restaurant detail should not default to work axis", () => {
    const res = inferCalendarEventIntent({
      ev: {
        title: "Reservation at BARBARA",
        start: "2026-05-03T18:00:00+09:00",
        end: "2026-05-03T19:00:00+09:00",
        description: "Dinner at Italian restaurant",
      },
      calendarOpening: null,
      profile: null,
    });
    expect(res.ambiguityFlags.workVsPrivate).toBe(false);
    expect(res.questionTemplateJa).toContain("仕事/就活");
  });

  it("Opaque title with competing work/private signals asks parallel confirm", () => {
    const res = inferCalendarEventIntent({
      ev: {
        title: "ACME",
        start: "2026-05-03T10:00:00+09:00",
        end: "2026-05-03T11:00:00+09:00",
        description: "面接 or meeting? restaurant near office",
      },
      calendarOpening: null,
      profile: null,
    });
    expect(res.ambiguityFlags.opaqueTitle).toBe(true);
    expect(res.askStyle).toBe("parallel_confirm");
  });

  it("Work-like keywords should push work axis", () => {
    const res = inferCalendarEventIntent({
      ev: {
        title: "面接",
        start: "2026-05-03T10:00:00+09:00",
        end: "2026-05-03T11:00:00+09:00",
        description: "Interview",
      },
      calendarOpening: null,
      profile: null,
    });
    expect(res.axes.work_or_jobhunt.score).toBeGreaterThan(0);
  });

  it("Travel keywords should set travel axis", () => {
    const res = inferCalendarEventIntent({
      ev: {
        title: "Trip",
        start: "2026-05-03T06:00:00+09:00",
        end: "2026-05-03T07:00:00+09:00",
        description: "Flight to HND airport",
      },
      calendarOpening: null,
      profile: null,
    });
    expect(res.axes.travel.score).toBeGreaterThanOrEqual(8);
  });
});

