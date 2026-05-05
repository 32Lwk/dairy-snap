import { NextRequest, NextResponse } from "next/server";
import { requireResolvedSession } from "@/lib/api/require-session";
import { env } from "@/env";
import { prisma } from "@/server/db";
import { scheduleGithubSync } from "@/server/github/sync";

export const runtime = "nodejs";

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!env.AUTH_GITHUB_ID?.trim() || !env.AUTH_GITHUB_SECRET?.trim()) {
    return NextResponse.json({ error: "GitHub が未設定です" }, { status: 503 });
  }

  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const linked = await prisma.gitHubConnection.findUnique({
    where: { userId: session.userId },
    select: { userId: true, lastSyncAt: true },
  });
  if (!linked) {
    return NextResponse.json({ error: "未連携です" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!ymdRe.test(from) || !ymdRe.test(to)) {
    return NextResponse.json({ error: "from / to は YYYY-MM-DD で指定してください" }, { status: 400 });
  }

  // カレンダー表示のたびに同期をキューすると無駄が多いので、直近に同期していればスキップする
  const now = Date.now();
  const last = linked.lastSyncAt?.getTime() ?? 0;
  const shouldQueueSync = now - last > 10 * 60 * 1000; // 10分
  if (shouldQueueSync) scheduleGithubSync(session.userId, "calendar");

  const rows = await prisma.gitHubContributionDay.findMany({
    where: {
      userId: session.userId,
      dateYmd: { gte: from, lte: to },
    },
    select: { dateYmd: true, contributionCount: true },
  });

  const byYmd: Record<string, number> = {};
  for (const r of rows) {
    byYmd[r.dateYmd] = r.contributionCount;
  }

  const status = await prisma.gitHubConnection.findUnique({
    where: { userId: session.userId },
    select: { lastSyncAt: true, lastSyncError: true, lastHttpStatus: true },
  });

  return NextResponse.json({
    from,
    to,
    byYmd,
    lastSyncAt: status?.lastSyncAt?.toISOString() ?? null,
    lastSyncError: status?.lastSyncError ?? null,
    lastHttpStatus: status?.lastHttpStatus ?? null,
  });
}
