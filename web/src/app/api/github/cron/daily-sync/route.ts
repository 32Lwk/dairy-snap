import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { prisma } from "@/server/db";
import { scheduleGithubSync } from "@/server/github/sync";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = env.GITHUB_SYNC_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "GITHUB_SYNC_CRON_SECRET 未設定" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await prisma.gitHubConnection.findMany({ select: { userId: true } });
  for (const r of rows) {
    scheduleGithubSync(r.userId, "cron");
  }
  return NextResponse.json({ ok: true, queued: rows.length });
}
