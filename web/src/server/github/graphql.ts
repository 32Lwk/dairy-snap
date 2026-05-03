import { GITHUB_GRAPHQL } from "@/server/github/constants";
import { githubFetchJson } from "@/server/github/http";

const CONTRIBUTION_CALENDAR_QUERY = `
query ContribCal($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`;

export type ContributionDayNode = { date: string; contributionCount: number };

export type ContributionCalendarGraphqlPayload = {
  data?: {
    viewer?: {
      contributionsCollection?: {
        contributionCalendar?: { weeks?: { contributionDays?: ContributionDayNode[] }[] };
      };
    };
  };
  errors?: { message: string }[];
};

/** GraphQL レスポンス本体から日次ノードを取り出す（HTTP 層とは独立・テスト用） */
export function contributionDaysFromContributionCalendarGraphql(
  body: ContributionCalendarGraphqlPayload,
): { ok: true; days: ContributionDayNode[] } | { ok: false; message: string } {
  const errs = body.errors;
  if (errs?.length) {
    return { ok: false, message: errs.map((e) => e.message).join("; ") };
  }
  const weeks = body.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks ?? [];
  const days: ContributionDayNode[] = [];
  for (const w of weeks) {
    for (const d of w.contributionDays ?? []) {
      if (d?.date) days.push({ date: d.date, contributionCount: d.contributionCount ?? 0 });
    }
  }
  return { ok: true, days };
}

export async function fetchContributionCalendarRange(
  accessToken: string,
  fromIso: string,
  toIso: string,
): Promise<{ ok: true; days: ContributionDayNode[] } | { ok: false; message: string; status: number }> {
  const res = await githubFetchJson<ContributionCalendarGraphqlPayload>(GITHUB_GRAPHQL, accessToken, {
    method: "POST",
    body: {
      query: CONTRIBUTION_CALENDAR_QUERY,
      variables: { from: fromIso, to: toIso },
    },
    accept: "application/json",
  });

  if (!res.ok) {
    return { ok: false, message: res.message, status: res.status };
  }
  const parsed = contributionDaysFromContributionCalendarGraphql(res.data);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, status: 502 };
  }
  return { ok: true, days: parsed.days };
}
