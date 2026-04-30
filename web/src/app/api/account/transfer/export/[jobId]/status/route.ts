import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { getExportJob } from "@/server/account-transfer/job-store";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  const resolved = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!resolved) {
    return NextResponse.json({ error: "再ログインしてください" }, { status: 401 });
  }

  const { jobId } = await ctx.params;
  const job = getExportJob(jobId, resolved.id);
  if (!job) {
    return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    byteLength: job.byteLength ?? null,
    error: job.error ?? null,
  });
}
