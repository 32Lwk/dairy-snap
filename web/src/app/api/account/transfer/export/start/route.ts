import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import { buildEncryptedBundle } from "@/server/account-transfer/export";
import {
  createExportJob,
  setExportJobStatus,
} from "@/server/account-transfer/job-store";
import { checkAndConsumeExportRate } from "@/server/account-transfer/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  passphrase: z.string().min(8).max(512),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  const resolved = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!resolved) {
    return NextResponse.json(
      { error: "セッションと一致するユーザーが見つかりません。再ログインしてください。" },
      { status: 401 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const rate = checkAndConsumeExportRate(resolved.id);
  if (!rate.ok) {
    scheduleAppLog(AppLogScope.account, "warn", "transfer_export_rate_limited", {
      userId: resolved.id,
      resetAt: new Date(rate.resetAt).toISOString(),
    });
    return NextResponse.json(
      {
        error: "エクスポート回数の上限に達しました。24時間後に再度お試しください。",
        resetAt: new Date(rate.resetAt).toISOString(),
      },
      { status: 429 },
    );
  }

  const job = createExportJob(resolved.id);
  scheduleAppLog(AppLogScope.account, "info", "transfer_export_started", {
    userId: resolved.id,
    jobId: job.id,
  });

  void (async () => {
    setExportJobStatus(job.id, { status: "running" });
    try {
      const result = await buildEncryptedBundle(resolved.id, parsed.data.passphrase);
      setExportJobStatus(job.id, {
        status: "succeeded",
        encryptedBundle: result.encryptedBundle,
        byteLength: result.byteLength,
      });
      scheduleAppLog(AppLogScope.account, "info", "transfer_export_succeeded", {
        userId: resolved.id,
        jobId: job.id,
        bytes: result.byteLength,
        images: result.imageCount,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportJobStatus(job.id, { status: "failed", error: msg.slice(0, 400) });
      scheduleAppLog(AppLogScope.account, "error", "transfer_export_failed", {
        userId: resolved.id,
        jobId: job.id,
        err: msg.slice(0, 400),
      });
    }
  })();

  return NextResponse.json({ jobId: job.id });
}
