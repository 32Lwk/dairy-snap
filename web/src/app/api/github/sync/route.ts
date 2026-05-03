import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireResolvedSession } from "@/lib/api/require-session";
import { env } from "@/env";
import { scheduleGithubSync, type GithubSyncReason } from "@/server/github/sync";

export const runtime = "nodejs";

const bodySchema = z.object({
  reason: z.enum(["calendar", "chat", "eod", "cron", "oauth_callback"]).optional(),
});

export async function POST(req: NextRequest) {
  if (!env.AUTH_GITHUB_ID?.trim() || !env.AUTH_GITHUB_SECRET?.trim()) {
    return NextResponse.json({ error: "GitHub が未設定です" }, { status: 503 });
  }

  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  let reason: GithubSyncReason = "calendar";
  try {
    const json = await req.json().catch(() => null);
    const p = bodySchema.safeParse(json);
    if (p.success && p.data.reason) reason = p.data.reason;
  } catch {
    /* body なし */
  }

  scheduleGithubSync(session.userId, reason);
  return NextResponse.json({ ok: true, queued: true });
}
