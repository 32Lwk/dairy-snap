import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import {
  BundleDecryptError,
  BundleFormatError,
  BundleTooLargeError,
} from "@/server/account-transfer/bundle-codec";
import { dryRunImport } from "@/server/account-transfer/import";
import {
  isPassphraseExhausted,
  recordPassphraseFailure,
} from "@/server/account-transfer/job-store";
import { MAX_BUNDLE_PLAINTEXT_BYTES } from "@/lib/account-transfer/bundle-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    return NextResponse.json({ error: "再ログインしてください" }, { status: 401 });
  }

  if (isPassphraseExhausted(resolved.id)) {
    return NextResponse.json(
      {
        error:
          "パスフレーズの試行回数が上限を超えました。30分待ってから再度お試しください。",
      },
      { status: 429 },
    );
  }

  const form = await req.formData().catch(() => null);
  const bundleFile = form?.get("bundle");
  const passphrase = form?.get("passphrase");

  if (!(bundleFile instanceof Blob) || typeof passphrase !== "string") {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }
  if (bundleFile.size > MAX_BUNDLE_PLAINTEXT_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { error: "バンドルが大きすぎます（200MB を超えています）" },
      { status: 413 },
    );
  }

  let bundleText: string;
  try {
    bundleText = await bundleFile.text();
  } catch {
    return NextResponse.json({ error: "バンドルの読み取りに失敗しました" }, { status: 400 });
  }

  try {
    const result = await dryRunImport(bundleText.trim(), passphrase, resolved.id);
    scheduleAppLog(AppLogScope.account, "info", "transfer_import_dryrun", {
      userId: resolved.id,
      entries: result.summary.counts.dailyEntries,
      images: result.summary.counts.images,
      conflictKeys: result.conflictingSettingsKeys.length,
      targetHasEntries: result.targetHasEntries,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleImportError(e, resolved.id, "dryrun");
  }
}

function handleImportError(e: unknown, userId: string, op: "dryrun" | "apply") {
  if (e instanceof BundleDecryptError) {
    const r = recordPassphraseFailure(userId);
    scheduleAppLog(AppLogScope.account, "warn", "transfer_import_decrypt_failed", {
      userId,
      op,
      attempts: r.count,
    });
    if (r.exhausted) {
      return NextResponse.json(
        {
          error:
            "パスフレーズの試行回数が上限を超えました。30分待ってから再度お試しください。",
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "パスフレーズが正しくないか、ファイルが壊れています" },
      { status: 400 },
    );
  }
  if (e instanceof BundleFormatError || e instanceof BundleTooLargeError) {
    scheduleAppLog(AppLogScope.account, "warn", "transfer_import_format_invalid", {
      userId,
      op,
      err: e.message.slice(0, 400),
    });
    return NextResponse.json(
      { error: `バンドル形式が不正です: ${e.message}` },
      { status: 400 },
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  scheduleAppLog(AppLogScope.account, "error", "transfer_import_failed", {
    userId,
    op,
    err: msg.slice(0, 400),
  });
  console.error(`[account/import:${op}]`, e);
  return NextResponse.json(
    { error: "インポートに失敗しました" },
    { status: 500 },
  );
}
