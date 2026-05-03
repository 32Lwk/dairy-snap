import { describe, expect, it } from "vitest";
import { contributionDaysFromContributionCalendarGraphql } from "@/server/github/graphql";

describe("contributionDaysFromContributionCalendarGraphql", () => {
  it("weeks から contributionDays を平坦化する", () => {
    const body = {
      data: {
        viewer: {
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    { date: "2024-01-01", contributionCount: 3 },
                    { date: "2024-01-02", contributionCount: 0 },
                  ],
                },
                { contributionDays: [{ date: "2024-01-08", contributionCount: 1 }] },
              ],
            },
          },
        },
      },
    };
    const r = contributionDaysFromContributionCalendarGraphql(body);
    expect(r).toEqual({
      ok: true,
      days: [
        { date: "2024-01-01", contributionCount: 3 },
        { date: "2024-01-02", contributionCount: 0 },
        { date: "2024-01-08", contributionCount: 1 },
      ],
    });
  });

  it("GraphQL errors なら ok: false", () => {
    const r = contributionDaysFromContributionCalendarGraphql({
      errors: [{ message: "rate limit" }, { message: "secondary" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("rate limit; secondary");
  });

  it("viewer 欠落時は空配列", () => {
    const r = contributionDaysFromContributionCalendarGraphql({});
    expect(r).toEqual({ ok: true, days: [] });
  });
});
