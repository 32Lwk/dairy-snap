import { NextResponse } from "next/server";
import { requireResolvedSession } from "@/lib/api/require-session";
import { env } from "@/env";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  if (!env.AUTH_GITHUB_ID?.trim() || !env.AUTH_GITHUB_SECRET?.trim()) {
    return NextResponse.json({
      configured: false,
      linked: false,
    });
  }

  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const row = await prisma.gitHubConnection.findUnique({
    where: { userId: session.userId },
    select: {
      login: true,
      scope: true,
      lastSyncAt: true,
      lastSyncError: true,
      lastHttpStatus: true,
      contributionsOldestYearSynced: true,
      syncSuccessCount: true,
      syncFailCount: true,
    },
  });

  if (!row) {
    return NextResponse.json({
      configured: true,
      linked: false,
    });
  }

  // NOTE: `/api/github/status` は初期描画（カレンダーの草）にも使うため、外部 HTTP は行わず即時応答する。
  // GitHub のアバターは login があれば GitHub 側のリダイレクト画像 URL を使える。
  const avatarUrl = row.login ? `https://github.com/${encodeURIComponent(row.login)}.png?size=96` : null;

  return NextResponse.json({
    configured: true,
    linked: true,
    login: row.login,
    avatarUrl,
    scope: row.scope,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError,
    lastHttpStatus: row.lastHttpStatus,
    contributionsInitialSyncDone: row.contributionsOldestYearSynced !== 0,
    syncSuccessCount: row.syncSuccessCount,
    syncFailCount: row.syncFailCount,
  });
}
