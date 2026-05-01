import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import {
  BundleDecryptError,
  BundleFormatError,
  BundleTooLargeError,
} from "@/server/account-transfer/bundle-codec";
import {
  applyImport,
  type OverlapChoice,
  parseOverlapChoices,
  scheduleEmbeddingRebuild,
} from "@/server/account-transfer/import";
import {
  clearPassphraseFailures,
  getImportPassphraseAttemptsRemaining,
  isPassphraseExhausted,
  recordPassphraseFailure,
} from "@/server/account-transfer/job-store";
import { MAX_BUNDLE_PLAINTEXT_BYTES } from "@/lib/account-transfer/bundle-schema";
import { ACCOUNT_TRANSFER_BUNDLE_DECRYPT_FAILED } from "@/lib/account-transfer/transfer-user-messages";

export const runtime = "nodejs";
export const maxDuration = 300;

const settingsKeysSchema = z.array(z.string().max(120)).max(200);

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
        passphraseAttemptsRemaining: 0,
      },
      { status: 429 },
    );
  }

  const form = await req.formData().catch(() => null);
  const bundleFile = form?.get("bundle");
  const passphrase = form?.get("passphrase");
  const settingsKeysRaw = form?.get("settingsSourceKeys");
  const overlapChoicesRaw = form?.get("overlapChoices");

  if (!(bundleFile instanceof Blob) || typeof passphrase !== "string") {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }
  if (bundleFile.size > MAX_BUNDLE_PLAINTEXT_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { error: "バンドルが大きすぎます（200MB を超えています）" },
      { status: 413 },
    );
  }

  let settingsSourceKeys: string[] = [];
  if (typeof settingsKeysRaw === "string" && settingsKeysRaw.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(settingsKeysRaw);
    } catch {
      return NextResponse.json(
        { error: "settingsSourceKeys の JSON 形式が不正です" },
        { status: 400 },
      );
    }
    const v = settingsKeysSchema.safeParse(parsed);
    if (!v.success) {
      return NextResponse.json(
        { error: "settingsSourceKeys の値が不正です" },
        { status: 400 },
      );
    }
    settingsSourceKeys = v.data;
  }

  let overlapChoices: Record<string, OverlapChoice> = {};
  if (typeof overlapChoicesRaw === "string" && overlapChoicesRaw.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(overlapChoicesRaw);
    } catch {
      return NextResponse.json(
        { error: "overlapChoices の JSON 形式が不正です" },
        { status: 400 },
      );
    }
    overlapChoices = parseOverlapChoices(parsed);
  }

  let bundleText: string;
  try {
    bundleText = await bundleFile.text();
  } catch {
    return NextResponse.json({ error: "バンドルの読み取りに失敗しました" }, { status: 400 });
  }

  scheduleAppLog(AppLogScope.account, "info", "transfer_import_started", {
    userId: resolved.id,
    settingsKeys: settingsSourceKeys.length,
  });

  try {
    const result = await applyImport(
      bundleText.trim(),
      passphrase,
      resolved.id,
      settingsSourceKeys,
      overlapChoices,
    );
    if (!result.ok) {
      scheduleAppLog(AppLogScope.account, "warn", "transfer_import_conflict", {
        userId: resolved.id,
        kind: result.error.kind,
      });
      return NextResponse.json({ error: result.error.message }, { status: 409 });
    }

    clearPassphraseFailures(resolved.id);
    scheduleEmbeddingRebuild(resolved.id);

    scheduleAppLog(AppLogScope.account, "info", "transfer_import_succeeded", {
      userId: resolved.id,
      entries: result.summary.counts.dailyEntries,
      images: result.summary.counts.images,
      chatMessages: result.summary.counts.chatMessages,
    });
    return NextResponse.json({ ok: true, summary: result.summary });
  } catch (e) {
    if (e instanceof BundleDecryptError) {
      const r = recordPassphraseFailure(resolved.id);
      scheduleAppLog(AppLogScope.account, "warn", "transfer_import_decrypt_failed", {
        userId: resolved.id,
        op: "apply",
        attempts: r.count,
      });
      if (r.exhausted) {
        return NextResponse.json(
          {
            error:
              "パスフレーズの試行回数が上限を超えました。30分待ってから再度お試しください。",
            passphraseAttemptsRemaining: 0,
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        {
          error: ACCOUNT_TRANSFER_BUNDLE_DECRYPT_FAILED,
          passphraseAttemptsRemaining: getImportPassphraseAttemptsRemaining(resolved.id),
        },
        { status: 400 },
      );
    }
    if (e instanceof BundleFormatError || e instanceof BundleTooLargeError) {
      scheduleAppLog(AppLogScope.account, "warn", "transfer_import_format_invalid", {
        userId: resolved.id,
        op: "apply",
        err: e.message.slice(0, 400),
      });
      return NextResponse.json(
        { error: `バンドル形式が不正です: ${e.message}` },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    scheduleAppLog(AppLogScope.account, "error", "transfer_import_failed", {
      userId: resolved.id,
      op: "apply",
      err: msg.slice(0, 400),
    });
    console.error("[account/import]", e);
    return NextResponse.json({ error: "インポートに失敗しました" }, { status: 500 });
  }
}
