import { formatYmdInTimeZone } from "@/lib/time/user-day-boundary";

export type GithubUserEvent = {
  id: string;
  type: string;
  created_at: string;
  repo?: { name?: string };
  payload?: Record<string, unknown>;
};

export type GithubActivityCounts = {
  push: number;
  pr: number;
  issue: number;
  review: number;
  other: number;
};

export type GithubDayActivitySummary = {
  counts: GithubActivityCounts;
  topRepo?: string;
  /** プロンプト用の短文（捏造なし） */
  linesJa: string[];
};

function bumpRepo(repos: Map<string, number>, name: string | undefined) {
  if (!name) return;
  repos.set(name, (repos.get(name) ?? 0) + 1);
}

export function aggregateGithubEventsByLocalDay(
  events: GithubUserEvent[],
  timeZone: string,
): Map<string, GithubDayActivitySummary> {
  const byDay = new Map<
    string,
    { counts: GithubActivityCounts; repos: Map<string, number>; samples: string[] }
  >();

  for (const ev of events) {
    const t = Date.parse(ev.created_at);
    if (!Number.isFinite(t)) continue;
    const ymd = formatYmdInTimeZone(new Date(t), timeZone);
    if (!byDay.has(ymd)) {
      byDay.set(ymd, {
        counts: { push: 0, pr: 0, issue: 0, review: 0, other: 0 },
        repos: new Map(),
        samples: [],
      });
    }
    const bucket = byDay.get(ymd)!;
    const repoName = ev.repo?.name;
    const type = ev.type;

    if (type === "PushEvent") {
      bucket.counts.push += 1;
      bumpRepo(bucket.repos, repoName);
      const size = (ev.payload?.size as number | undefined) ?? 0;
      if (bucket.samples.length < 4 && repoName) {
        bucket.samples.push(`${repoName} に push（コミット ${size} 件程度）`);
      }
    } else if (type === "PullRequestEvent") {
      bucket.counts.pr += 1;
      bumpRepo(bucket.repos, repoName);
      const action = String(ev.payload?.action ?? "");
      if (bucket.samples.length < 4 && repoName) {
        bucket.samples.push(`${repoName} で PR ${action || "更新"}`);
      }
    } else if (type === "IssuesEvent") {
      bucket.counts.issue += 1;
      bumpRepo(bucket.repos, repoName);
      const action = String(ev.payload?.action ?? "");
      if (bucket.samples.length < 4 && repoName) {
        bucket.samples.push(`${repoName} で Issue ${action || "更新"}`);
      }
    } else if (type === "PullRequestReviewEvent" || type === "PullRequestReviewCommentEvent") {
      bucket.counts.review += 1;
      bumpRepo(bucket.repos, repoName);
    } else {
      bucket.counts.other += 1;
    }
  }

  const out = new Map<string, GithubDayActivitySummary>();
  for (const [ymd, v] of byDay) {
    let topRepo: string | undefined;
    let topN = 0;
    for (const [name, n] of v.repos) {
      if (n > topN) {
        topN = n;
        topRepo = name;
      }
    }
    const linesJa = [...v.samples];
    const c = v.counts;
    if (linesJa.length === 0 && (c.push + c.pr + c.issue + c.review + c.other) > 0) {
      linesJa.push("GitHub で活動あり（詳細タイプは集計のみ）");
    }
    out.set(ymd, { counts: c, topRepo, linesJa });
  }
  return out;
}
