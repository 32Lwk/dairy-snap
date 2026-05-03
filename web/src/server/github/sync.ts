import { isValidIanaTimeZone } from "@/lib/time/user-day-boundary";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { scheduleAppLog, AppLogScope } from "@/lib/server/app-log";
import { fetchContributionCalendarRange } from "@/server/github/graphql";
import { aggregateGithubEventsByLocalDay, type GithubUserEvent } from "@/server/github/events";
import { githubFetchJson } from "@/server/github/http";
import { GITHUB_API_BASE } from "@/server/github/constants";
import { loadGithubOAuthToken } from "@/server/github/token-store";

const CONTRIBUTION_YEARS_WINDOW = 3;

function calendarYearUtc(d: Date): number {
  return d.getUTCFullYear();
}

export type GithubSyncReason = "calendar" | "chat" | "eod" | "cron" | "oauth_callback";

async function upsertContributionDays(userId: string, days: { date: string; contributionCount: number }[]) {
  const chunk = 100;
  for (let i = 0; i < days.length; i += chunk) {
    const part = days.slice(i, i + chunk);
    await prisma.$transaction(
      part.map((d) =>
        prisma.gitHubContributionDay.upsert({
          where: { userId_dateYmd: { userId, dateYmd: d.date } },
          create: {
            userId,
            dateYmd: d.date,
            contributionCount: d.contributionCount,
          },
          update: { contributionCount: d.contributionCount },
        }),
      ),
    );
  }
}

export async function runGithubSync(userId: string, reason: GithubSyncReason): Promise<void> {
  const [tokenRow, conn, userRow] = await Promise.all([
    loadGithubOAuthToken(userId),
    prisma.gitHubConnection.findUnique({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true, timeZone: true },
    }),
  ]);

  if (!tokenRow || !conn) {
    scheduleAppLog(AppLogScope.github, "debug", "github_sync_skip_no_token", { reason });
    return;
  }

  const profileTz = parseUserSettings(userRow?.settings ?? {}).profile?.timeZone;
  const tz =
    typeof profileTz === "string" && isValidIanaTimeZone(profileTz)
      ? profileTz
      : userRow?.timeZone && isValidIanaTimeZone(userRow.timeZone)
        ? userRow.timeZone
        : "Asia/Tokyo";

  const accessToken = tokenRow.accessToken;
  const login = conn.login;
  let contribAllOk = true;
  let eventsOk = true;
  let eventsRateLimited = false;
  let lastHttp = 200;

  try {
    const now = new Date();
    const cy = calendarYearUtc(now);
    const oldestTarget = cy - (CONTRIBUTION_YEARS_WINDOW - 1);

    const yearsToFetch: number[] =
      conn.contributionsOldestYearSynced === 0
        ? [cy, cy - 1, cy - 2]
        : Array.from(new Set([cy, cy - 1, cy - 2])).sort((a, b) => b - a);

    for (const year of yearsToFetch) {
      const fromIso = `${year}-01-01T00:00:00Z`;
      const toIso = `${year + 1}-01-01T00:00:00Z`;
      const cal = await fetchContributionCalendarRange(accessToken, fromIso, toIso);
      if (!cal.ok) {
        contribAllOk = false;
        lastHttp = cal.status;
        scheduleAppLog(AppLogScope.github, "warn", "github_sync_contributions_failed", {
          year,
          status: cal.status,
          msg: cal.message.slice(0, 200),
        });
        continue;
      }
      await upsertContributionDays(userId, cal.days);
    }

    if (contribAllOk && conn.contributionsOldestYearSynced === 0) {
      await prisma.gitHubConnection.update({
        where: { userId },
        data: { contributionsOldestYearSynced: oldestTarget },
      });
    }

    const eventsUrl = `${GITHUB_API_BASE}/users/${encodeURIComponent(login)}/events?per_page=100`;
    const evRes = await githubFetchJson<GithubUserEvent[]>(eventsUrl, accessToken, {
      etag: conn.eventsEtag ?? undefined,
    });

    if (!evRes.ok) {
      eventsOk = false;
      lastHttp = evRes.status;
      eventsRateLimited = Boolean(evRes.rateLimited);
      scheduleAppLog(AppLogScope.github, "warn", "github_sync_events_failed", {
        status: evRes.status,
        msg: evRes.message.slice(0, 200),
      });
    } else if (evRes.status === 304) {
      // not modified — keep snapshots and etag
    } else {
      const events = Array.isArray(evRes.data) ? evRes.data : [];
      const byDay = aggregateGithubEventsByLocalDay(events, tz);
      const chunk = 50;
      const entries = [...byDay.entries()];
      for (let i = 0; i < entries.length; i += chunk) {
        const slice = entries.slice(i, i + chunk);
        await prisma.$transaction(
          slice.map(([dateYmd, summary]) => {
            const payload = {
              counts: summary.counts,
              topRepo: summary.topRepo ?? null,
              linesJa: summary.linesJa,
            };
            return prisma.gitHubDailySnapshot.upsert({
              where: { userId_dateYmd: { userId, dateYmd } },
              create: { userId, dateYmd, summary: payload },
              update: { summary: payload },
            });
          }),
        );
      }

      if (evRes.etag) {
        await prisma.gitHubConnection.update({
          where: { userId },
          data: { eventsEtag: evRes.etag },
        });
      }
    }

    const overallOk = contribAllOk && eventsOk;
    await prisma.gitHubConnection.update({
      where: { userId },
      data: {
        lastSyncAt: new Date(),
        lastHttpStatus: lastHttp,
        lastSyncError: overallOk ? null : "github_sync_partial_or_failed",
        ...(overallOk
          ? { syncSuccessCount: { increment: 1 } }
          : { syncFailCount: { increment: 1 } }),
        ...(eventsRateLimited ? { rateLimitHits: { increment: 1 } } : {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    scheduleAppLog(AppLogScope.github, "error", "github_sync_exception", { msg: msg.slice(0, 400) });
    await prisma.gitHubConnection.update({
      where: { userId },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: msg.slice(0, 2000),
        syncFailCount: { increment: 1 },
      },
    });
  }

  scheduleAppLog(AppLogScope.github, "info", "github_sync_done", { reason });
}

export function scheduleGithubSync(userId: string, reason: GithubSyncReason): void {
  setImmediate(() => {
    void runGithubSync(userId, reason).catch((e) => {
      console.error("[github] scheduleGithubSync", e);
    });
  });
}
