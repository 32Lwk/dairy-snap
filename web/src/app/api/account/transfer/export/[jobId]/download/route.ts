import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import {
  getExportJob,
} from "@/server/account-transfer/job-store";

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
  if (job.status !== "succeeded" || !job.encryptedBundle) {
    return NextResponse.json(
      { error: "バンドルがまだ準備できていません" },
      { status: 409 },
    );
  }

  const bytes = new TextEncoder().encode(job.encryptedBundle);
  scheduleAppLog(AppLogScope.account, "info", "transfer_export_downloaded", {
    userId: resolved.id,
    jobId,
    bytes: bytes.byteLength,
  });

  const filename = `dairy-snap-export-${jobId.slice(0, 8)}.dsbundle`;
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      // ブラウザ側の扱いを安定させるため octet-stream にする
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
