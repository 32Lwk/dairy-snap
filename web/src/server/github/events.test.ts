import { describe, expect, it } from "vitest";
import { aggregateGithubEventsByLocalDay, type GithubUserEvent } from "@/server/github/events";

describe("aggregateGithubEventsByLocalDay", () => {
  it("同一 UTC 時刻が TZ により別暦日に振り分けられる", () => {
    const ev: GithubUserEvent = {
      id: "1",
      type: "PushEvent",
      created_at: "2024-01-15T17:00:00Z",
      repo: { name: "org/repo" },
      payload: { size: 2 },
    };
    const la = aggregateGithubEventsByLocalDay([ev], "America/Los_Angeles");
    const tk = aggregateGithubEventsByLocalDay([ev], "Asia/Tokyo");
    expect(la.has("2024-01-15")).toBe(true);
    expect(tk.has("2024-01-16")).toBe(true);
    expect(la.get("2024-01-15")?.counts.push).toBe(1);
    expect(tk.get("2024-01-16")?.counts.push).toBe(1);
  });

  it("イベント種別ごとにカウントしサンプル行を付ける", () => {
    const events: GithubUserEvent[] = [
      {
        id: "a",
        type: "PushEvent",
        created_at: "2024-06-01T12:00:00Z",
        repo: { name: "x/push" },
        payload: { size: 1 },
      },
      {
        id: "b",
        type: "PullRequestEvent",
        created_at: "2024-06-01T12:05:00Z",
        repo: { name: "x/pr" },
        payload: { action: "opened" },
      },
      {
        id: "c",
        type: "IssuesEvent",
        created_at: "2024-06-01T12:10:00Z",
        repo: { name: "x/is" },
        payload: { action: "closed" },
      },
      {
        id: "d",
        type: "PullRequestReviewEvent",
        created_at: "2024-06-01T12:15:00Z",
        repo: { name: "x/rv" },
        payload: {},
      },
    ];
    const m = aggregateGithubEventsByLocalDay(events, "UTC");
    const ymd = "2024-06-01";
    const day = m.get(ymd);
    expect(day).toBeDefined();
    expect(day!.counts).toEqual({ push: 1, pr: 1, issue: 1, review: 1, other: 0 });
    expect(day!.linesJa.length).toBeGreaterThan(0);
    expect(day!.topRepo).toBeDefined();
  });

  it("不正な created_at はスキップ", () => {
    const m = aggregateGithubEventsByLocalDay(
      [{ id: "x", type: "PushEvent", created_at: "not-a-date", repo: { name: "a/b" } }],
      "Asia/Tokyo",
    );
    expect(m.size).toBe(0);
  });
});
