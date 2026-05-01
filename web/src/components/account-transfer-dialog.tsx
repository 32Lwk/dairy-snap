"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import {
  IMPORT_PASSPHRASE_ATTEMPT_LIMIT,
  IMPORT_PASSPHRASE_COOLDOWN_MINUTES,
  IMPORT_PASSPHRASE_COUNTING_WINDOW_MINUTES,
} from "@/lib/account-transfer/import-passphrase-policy";

type OverlapChoice = "skip" | "replace" | "merge";

type OverlapDateRow = {
  entryDateYmd: string;
  bundle: {
    title: string | null;
    bodyPreview: string;
    imageCount: number;
    imageUploadedCount: number;
    imageGeneratedCount: number;
    chatThreadCount: number;
  };
  target: {
    title: string | null;
    bodyPreview: string;
    imageCount: number;
    chatThreadCount: number;
  };
};

type Mode = "export" | "import";

type Props = {
  open: boolean;
  mode: Mode;
  onClose: () => void;
};

export function AccountTransferDialog({ open, mode, onClose }: Props) {
  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      labelledBy="account-transfer-title"
      dialogId="account-transfer"
      presentation="island"
    >
      {mode === "export" ? (
        <ExportFlow onClose={onClose} />
      ) : (
        <ImportFlow onClose={onClose} />
      )}
    </ResponsiveDialog>
  );
}

/* =========================== Export ============================ */

type ExportPhase = "input" | "running" | "ready" | "downloaded" | "error";

function ExportFlow({ onClose }: { onClose: () => void }) {
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [phase, setPhase] = useState<ExportPhase>("input");
  const [jobId, setJobId] = useState<string | null>(null);
  const [byteLength, setByteLength] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  const passOk = pass1.length >= 12 && pass1 === pass2;
  const passMismatch = pass2.length > 0 && pass1 !== pass2;

  function generatePassphrase() {
    const arr = new Uint8Array(24);
    window.crypto.getRandomValues(arr);
    const alphabet =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let s = "";
    for (let i = 0; i < arr.length; i += 1) {
      s += alphabet[arr[i]! % alphabet.length];
    }
    setPass1(s);
    setPass2(s);
    setShowPass(true);
  }

  async function copyPass() {
    try {
      await navigator.clipboard.writeText(pass1);
    } catch {
      /* noop */
    }
  }

  async function startExport() {
    setError(null);
    if (!passOk) return;
    setPhase("running");
    try {
      const res = await fetch("/api/account/transfer/export/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pass1 }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !json.jobId) {
        setPhase("error");
        setError(json.error ?? "エクスポートを開始できませんでした");
        return;
      }
      setJobId(json.jobId);
      pollStatus(json.jobId);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function pollStatus(id: string) {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/account/transfer/export/${id}/status`);
        const j = (await r.json().catch(() => ({}))) as {
          status?: string;
          byteLength?: number | null;
          error?: string | null;
        };
        if (j.status === "succeeded") {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setByteLength(j.byteLength ?? null);
          setPhase("ready");
        } else if (j.status === "failed") {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("error");
          setError(j.error ?? "エクスポートに失敗しました");
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
  }

  function downloadHref() {
    if (!jobId) return "#";
    return `/api/account/transfer/export/${jobId}/download`;
  }

  return (
    <div className="flex max-h-[80vh] flex-col">
      <header className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2
          id="account-transfer-title"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          データのエクスポート
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          すべての日記・チャット・設定などを暗号化したバンドル(.dsbundle)としてダウンロードします。
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-800 dark:text-zinc-100">
        {phase === "input" || phase === "running" ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              バンドルはこのパスフレーズでのみ復号できます。忘れるとデータを取り戻せません。安全な場所に控えてください。
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                パスフレーズ（12文字以上）
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type={showPass ? "text" : "password"}
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  placeholder="例: T7uM-Px3-Vn9-Qa2"
                  autoComplete="new-password"
                  disabled={phase === "running"}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                  disabled={phase === "running"}
                >
                  {showPass ? "隠す" : "表示"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                確認のためもう一度
              </label>
              <input
                type={showPass ? "text" : "password"}
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                autoComplete="new-password"
                disabled={phase === "running"}
              />
              {passMismatch && (
                <p className="mt-1 text-xs text-red-600">2つのパスフレーズが一致しません。</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={generatePassphrase}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
                disabled={phase === "running"}
              >
                ランダムに生成
              </button>
              <button
                type="button"
                onClick={() => void copyPass()}
                disabled={!pass1 || phase === "running"}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
              >
                コピー
              </button>
            </div>

            {phase === "running" && (
              <p className="text-xs text-zinc-500">エクスポート中… 数十秒かかることがあります。</p>
            )}
          </div>
        ) : null}

        {phase === "ready" && (
          <div className="space-y-3">
            <p className="text-sm">
              バンドルの準備ができました。
              {byteLength != null && (
                <span className="ml-1 text-zinc-500">
                  （平文サイズの目安: {formatBytes(byteLength)}）
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              ダウンロード後、このバンドルとパスフレーズの両方を引き継ぎ先環境に持ち込んでください。
            </p>
          </div>
        )}

        {phase === "downloaded" && (
          <div className="space-y-2">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              ダウンロードを開始しました。引き継ぎ先環境にバンドルを持ち込み、再ログインしてからインポートしてください。
            </p>
            {jobId && (
              <p className="text-xs text-zinc-500">
                もし保存されない場合は、こちらのリンクから手動でダウンロードできます。{" "}
                <a
                  className="underline"
                  href={`/api/account/transfer/export/${jobId}/download`}
                  download={`dairy-snap-export-${jobId.slice(0, 8)}.dsbundle`}
                >
                  バンドルをダウンロード
                </a>
              </p>
            )}
          </div>
        )}

        {phase === "error" && (
          <p className="text-sm text-red-600">{error ?? "エクスポートに失敗しました"}</p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
        >
          閉じる
        </button>
        {phase === "input" && (
          <button
            type="button"
            onClick={() => void startExport()}
            disabled={!passOk}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            エクスポートを開始
          </button>
        )}
        {phase === "ready" && (
          <a
            href={downloadHref()}
            download={jobId ? `dairy-snap-export-${jobId.slice(0, 8)}.dsbundle` : undefined}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            onClick={() => {
              setPhase("downloaded");
            }}
          >
            ダウンロード
          </a>
        )}
        {phase === "error" && (
          <button
            type="button"
            onClick={() => {
              setPhase("input");
              setError(null);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            やり直す
          </button>
        )}
      </footer>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatYmdJa(ymd: string): string {
  const p = ymd.split("-").map(Number);
  const y = p[0];
  const m = p[1];
  const d = p[2];
  if (y == null || m == null || d == null) return ymd;
  return `${y}年${m}月${d}日`;
}

function ChoicePill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2 py-0.5 text-[11px] " +
        (selected
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
          : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80")
      }
    >
      {children}
    </button>
  );
}

/* =========================== Import ============================ */

type ImportPhase =
  | "input"
  | "verifying"
  | "review"
  | "applying"
  | "success"
  | "error";

type DryRun = {
  ok: true;
  summary: {
    exportedAt: string;
    source: { emailMasked: string };
    counts: {
      dailyEntries: number;
      images: number;
      chatMessages: number;
      appLocalCalendars: number;
      googleCalendarEvents: number;
      tags: number;
      memoryLongTerm: number;
      memoryShortTerm: number;
      agentMemory: number;
      usageCounters: number;
      skippedE2eeEntries: number;
    };
    blobs: { count: number; totalBytes: number };
    settingsKeys: string[];
  };
  targetHasEntries: boolean;
  targetSettingsKeys: string[];
  conflictingSettingsKeys: string[];
  conflictingSettingsDetail: Array<{
    key: string;
    bundleText: string;
    targetText: string;
  }>;
  importPlan: {
    targetExistingDailyCount: number;
    bundleDailyCount: number;
    importableDailyCount: number;
    skippedDailyDueToDateOverlap: number;
    dropsBundledGlobalSnapshot: boolean;
    canImport: boolean;
  };
  importPreviewCounts: {
    dailyEntries: number;
    images: number;
    chatMessages: number;
    appLocalCalendars: number;
    googleCalendarEvents: number;
    tags: number;
    memoryLongTerm: number;
    memoryShortTerm: number;
    agentMemory: number;
    usageCounters: number;
    skippedE2eeEntries: number;
  };
  importPreviewBlobs: { count: number; totalBytes: number };
  importPreviewDetail: {
    entryDatesYmd: string[];
    imageByKind: { uploaded: number; generated: number };
    tagNames: string[];
    appLocalCalendarNames: string[];
    chatThreadSummaries: string[];
    googleCalendarSampleTitles: string[];
    memoryLongTermCount: number;
    memoryShortTermEntryDates: string[];
    agentMemoryLines: string[];
    usageCounterDatesYmd: string[];
  };
  overlapDateRows: OverlapDateRow[];
  newImportDates: string[];
  /** dryrun 成功時など API が付与。試行余裕の表示用 */
  passphraseAttemptsRemaining?: number;
};

function ImportReviewTabBar(props: {
  dryRun: DryRun;
  reviewTab: "overview" | "dates" | "settings";
  onReviewTab: (t: "overview" | "dates" | "settings") => void;
}) {
  const { dryRun, reviewTab, onReviewTab } = props;
  const tabBtn = (id: typeof reviewTab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={reviewTab === id}
      onClick={() => onReviewTab(id)}
      className={
        "min-w-0 flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight transition-colors " +
        (reviewTab === id
          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
      }
    >
      {label}
    </button>
  );

  return (
    <div
      className="mt-2 flex rounded-lg border border-zinc-200/90 bg-zinc-100/90 p-0.5 dark:border-zinc-700 dark:bg-zinc-900/80"
      role="tablist"
      aria-label="インポート確認の表示切替"
    >
      {tabBtn("overview", "概要")}
      {tabBtn(
        "dates",
        `日付 (${dryRun.newImportDates.length} 新規 / ${dryRun.overlapDateRows.length} 重複)`,
      )}
      {tabBtn(
        "settings",
        `設定${dryRun.conflictingSettingsKeys.length ? ` (${dryRun.conflictingSettingsKeys.length})` : ""}`,
      )}
    </div>
  );
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<ImportPhase>("input");
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [chosen, setChosen] = useState<Record<string, "source" | "target">>({});
  const [overlapChoices, setOverlapChoices] = useState<Record<string, OverlapChoice>>({});
  const [reviewTab, setReviewTab] = useState<"overview" | "dates" | "settings">("overview");
  const [detailYmd, setDetailYmd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [passphraseAttemptsRemaining, setPassphraseAttemptsRemaining] = useState<number | null>(
    null,
  );

  const canVerify = file !== null && passphrase.length >= 8;

  const effectiveCanImport = useMemo(() => {
    if (!dryRun) return false;
    if (dryRun.importPlan.bundleDailyCount === 0) return false;
    const hasNew = dryRun.newImportDates.length > 0;
    const hasOverlapAction = dryRun.overlapDateRows.some(
      (r) => (overlapChoices[r.entryDateYmd] ?? "skip") !== "skip",
    );
    return hasNew || hasOverlapAction || dryRun.importPlan.canImport;
  }, [dryRun, overlapChoices]);

  const dropsBundledGlobalSnapshotEffective = useMemo(() => {
    if (!dryRun || !dryRun.targetHasEntries || dryRun.overlapDateRows.length === 0) {
      return false;
    }
    return dryRun.overlapDateRows.some((r) => {
      const ch = overlapChoices[r.entryDateYmd] ?? "skip";
      return ch === "skip" || ch === "merge";
    });
  }, [dryRun, overlapChoices]);

  const replaceDates = useMemo(() => {
    if (!dryRun) return [];
    return dryRun.overlapDateRows
      .filter((r) => overlapChoices[r.entryDateYmd] === "replace")
      .map((r) => r.entryDateYmd)
      .sort();
  }, [dryRun, overlapChoices]);

  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);

  async function runDryRun() {
    if (!file) return;
    setError(null);
    setVerifyError(null);
    setPassphraseAttemptsRemaining(null);
    setPhase("verifying");
    const fd = new FormData();
    fd.append("bundle", file);
    fd.append("passphrase", passphrase);
    try {
      const res = await fetch("/api/account/transfer/import/dryrun", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as DryRun & {
        error?: string;
        passphraseAttemptsRemaining?: number;
      };
      if (!res.ok) {
        setPhase("input");
        setVerifyError(json.error ?? "検証に失敗しました。しばらくしてからもう一度お試しください。");
        setPassphraseAttemptsRemaining(
          typeof json.passphraseAttemptsRemaining === "number"
            ? json.passphraseAttemptsRemaining
            : null,
        );
        return;
      }
      setDryRun(json as DryRun);
      setPassphraseAttemptsRemaining(
        typeof json.passphraseAttemptsRemaining === "number"
          ? json.passphraseAttemptsRemaining
          : null,
      );
      const initial: Record<string, "source" | "target"> = {};
      for (const k of json.conflictingSettingsKeys) initial[k] = "target";
      setChosen(initial);
      setOverlapChoices({});
      setReviewTab("overview");
      setDetailYmd(null);
      setOverwriteConfirmOpen(false);
      setPhase("review");
    } catch (e) {
      setPhase("input");
      setPassphraseAttemptsRemaining(null);
      setVerifyError(
        e instanceof Error
          ? "通信に失敗しました。接続をご確認のうえ、もう一度「検証」を押してください。"
          : String(e),
      );
    }
  }

  async function applyImport() {
    if (!file || !dryRun) return;
    setError(null);
    setVerifyError(null);
    setPassphraseAttemptsRemaining(null);
    setPhase("applying");
    const fd = new FormData();
    fd.append("bundle", file);
    fd.append("passphrase", passphrase);
    const sourceKeys = dryRun.summary.settingsKeys.filter(
      (k) => chosen[k] === "source" || !dryRun.conflictingSettingsKeys.includes(k),
    );
    fd.append("settingsSourceKeys", JSON.stringify(sourceKeys));
    fd.append("overlapChoices", JSON.stringify(overlapChoices));
    try {
      const res = await fetch("/api/account/transfer/import", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setPhase("error");
        setError(json.error ?? "インポートに失敗しました");
        return;
      }
      setPhase("success");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function requestImport() {
    if (!file || !dryRun || !effectiveCanImport) return;
    if (replaceDates.length > 0) {
      setOverwriteConfirmOpen(true);
      return;
    }
    void applyImport();
  }

  return (
    <div className="flex max-h-[80vh] flex-col">
      <header className="shrink-0 border-b border-zinc-200 px-5 pb-2 pt-2.5 dark:border-zinc-800">
        <h2
          id="account-transfer-title"
          className="text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-50"
        >
          データのインポート
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          別環境でエクスポートしたバンドル(.dsbundle)とパスフレーズで、このアカウントへ取り込みます。
        </p>
        {phase === "review" && dryRun ? (
          <ImportReviewTabBar
            dryRun={dryRun}
            reviewTab={reviewTab}
            onReviewTab={setReviewTab}
          />
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-800 dark:text-zinc-100">
        {phase === "input" || phase === "verifying" ? (
          <ImportInputStep
            file={file}
            onFile={(f) => {
              setVerifyError(null);
              setPassphraseAttemptsRemaining(null);
              setFile(f);
            }}
            passphrase={passphrase}
            onPassphrase={(s) => {
              setVerifyError(null);
              setPassphraseAttemptsRemaining(null);
              setPassphrase(s);
            }}
            showPass={showPass}
            onToggleShow={() => setShowPass((v) => !v)}
            verifying={phase === "verifying"}
            verifyErrorMessage={phase === "input" ? verifyError : null}
            passphraseAttemptsRemainingHint={passphraseAttemptsRemaining}
          />
        ) : null}

        {phase === "review" && dryRun && (
          <ImportReviewStep
            dryRun={dryRun}
            chosen={chosen}
            onChoose={(k, v) => setChosen((prev) => ({ ...prev, [k]: v }))}
            reviewTab={reviewTab}
            onReviewTab={setReviewTab}
            overlapChoices={overlapChoices}
            onOverlapChoice={(ymd, c) =>
              setOverlapChoices((prev) => ({ ...prev, [ymd]: c }))
            }
            onResetAllOverlapsToSkip={() => {
              setOverlapChoices((prev) => {
                if (!dryRun) return prev;
                const n = { ...prev };
                for (const r of dryRun.overlapDateRows) n[r.entryDateYmd] = "skip";
                return n;
              });
            }}
            detailYmd={detailYmd}
            onDetailYmd={setDetailYmd}
            dropsBundledGlobalSnapshotEffective={dropsBundledGlobalSnapshotEffective}
          />
        )}

        {phase === "applying" && (
          <p className="text-sm text-zinc-600">インポート中… ファイル数によっては時間がかかります。</p>
        )}

        {phase === "success" && (
          <div className="space-y-2">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              インポートが完了しました。検索インデックスはバックグラウンドで再構築中です。
            </p>
            <p className="text-xs text-zinc-500">
              ページを再読み込みすると、新しいデータが反映されます。
            </p>
          </div>
        )}

        {phase === "error" && (
          <p className="text-sm text-red-600">{error ?? "エラーが発生しました"}</p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
        >
          {phase === "success" ? "完了" : "閉じる"}
        </button>
        {phase === "input" && (
          <button
            type="button"
            onClick={() => void runDryRun()}
            disabled={!canVerify}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            検証
          </button>
        )}
        {phase === "review" && dryRun && (
          <button
            type="button"
            onClick={() => requestImport()}
            disabled={!effectiveCanImport}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            title={
              !effectiveCanImport
                ? "取り込める内容がありません。新規日付がない場合は重複日で「上書き」か「本文を結合」を選んでください。"
                : ""
            }
          >
            この内容でインポート
          </button>
        )}
        {phase === "error" && (
          <button
            type="button"
            onClick={() => {
              setPhase("input");
              setError(null);
              setVerifyError(null);
              setPassphraseAttemptsRemaining(null);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            やり直す
          </button>
        )}
      </footer>
      <ImportOverwriteConfirmDialog
        open={overwriteConfirmOpen}
        replaceDates={replaceDates}
        onCancel={() => setOverwriteConfirmOpen(false)}
        onConfirm={() => {
          setOverwriteConfirmOpen(false);
          void applyImport();
        }}
      />
    </div>
  );
}

function ImportOverwriteConfirmDialog(props: {
  open: boolean;
  replaceDates: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { open, replaceDates, onCancel, onConfirm } = props;
  return (
    <ResponsiveDialog
      open={open}
      onClose={onCancel}
      labelledBy="import-overwrite-confirm-title"
      dialogId="import-overwrite-confirm"
      presentation="island"
      zClass="z-[60]"
      panelClassName="max-w-md"
    >
      <div className="flex flex-col">
        <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="import-overwrite-confirm-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            バンドルで上書きの確認
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            次の日付の<strong className="font-medium text-zinc-800 dark:text-zinc-200">既存の日記</strong>
            および、紐づく画像・チャットなどは
            <strong className="font-medium text-red-700 dark:text-red-400"> 削除されたうえで </strong>
            バンドル側の内容に置き換わります。この操作は取り消せません。
          </p>
        </header>
        <div className="max-h-48 overflow-y-auto px-4 py-3">
          <ul className="space-y-1 text-xs text-zinc-800 dark:text-zinc-200">
            {replaceDates.map((ymd) => (
              <li
                key={ymd}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60"
              >
                {formatYmdJa(ymd)}
              </li>
            ))}
          </ul>
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          >
            上書きしてインポート
          </button>
        </footer>
      </div>
    </ResponsiveDialog>
  );
}

function ImportInputStep(props: {
  file: File | null;
  onFile: (f: File | null) => void;
  passphrase: string;
  onPassphrase: (s: string) => void;
  showPass: boolean;
  onToggleShow: () => void;
  verifying: boolean;
  verifyErrorMessage: string | null;
  passphraseAttemptsRemainingHint: number | null;
}) {
  const {
    file,
    onFile,
    passphrase,
    onPassphrase,
    showPass,
    onToggleShow,
    verifying,
    verifyErrorMessage,
    passphraseAttemptsRemainingHint,
  } = props;
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          バンドル (.dsbundle)
        </label>
        <input
          type="file"
          accept=".dsbundle,application/jose,application/octet-stream,text/plain"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-2 file:py-1 file:text-xs file:text-zinc-800 dark:file:border-zinc-600 dark:file:bg-zinc-900 dark:file:text-zinc-100"
          disabled={verifying}
        />
        {file && (
          <p className="mt-1 text-xs text-zinc-500">
            {file.name} ({formatBytes(file.size)})
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          パスフレーズ
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type={showPass ? "text" : "password"}
            value={passphrase}
            onChange={(e) => onPassphrase(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
            autoComplete="off"
            disabled={verifying}
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
            disabled={verifying}
          >
            {showPass ? "隠す" : "表示"}
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {IMPORT_PASSPHRASE_COUNTING_WINDOW_MINUTES}分以内にパスフレーズを{IMPORT_PASSPHRASE_ATTEMPT_LIMIT}
          回まで誤ると、{IMPORT_PASSPHRASE_COOLDOWN_MINUTES}
          分のクールダウンが入ります。
          {passphraseAttemptsRemainingHint !== null &&
          passphraseAttemptsRemainingHint > 0 &&
          passphraseAttemptsRemainingHint < IMPORT_PASSPHRASE_ATTEMPT_LIMIT ? (
            <>
              {" "}
              いまは、あと {passphraseAttemptsRemainingHint} 回誤るとクールダウンです。
            </>
          ) : null}
        </p>
        {verifyErrorMessage ? (
          <div
            role="alert"
            className="mt-2 rounded-lg border border-red-200/90 bg-red-50/95 px-2.5 py-2 text-xs leading-relaxed text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          >
            {verifyErrorMessage}
          </div>
        ) : null}
      </div>

      {verifying && (
        <p className="text-xs text-zinc-500">バンドルを復号して内容を確認しています…</p>
      )}
    </div>
  );
}

function ImportDateDetailModal(props: {
  open: boolean;
  row: OverlapDateRow | null;
  choice: OverlapChoice;
  onClose: () => void;
  onPick: (c: OverlapChoice) => void;
}) {
  const { open, row, choice, onClose, onPick } = props;
  if (!row) return null;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      labelledBy="import-overlap-detail-title"
      dialogId="import-overlap-detail"
      presentation="island"
      zClass="z-[60]"
      panelClassName="max-w-2xl"
    >
      <div className="flex max-h-[min(88dvh,40rem)] flex-col">
        <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="import-overlap-detail-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {formatYmdJa(row.entryDateYmd)} の比較
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            左右のプレビューを確認し、下のボタンで取り込み方を決めます。画像は枚数のみ表示します（バンドル内のバイナリはこの画面では開きません）。
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                このアカウント
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {row.target.title?.trim() || "（タイトルなし）"}
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                画像 {row.target.imageCount} 枚・チャットスレッド {row.target.chatThreadCount} 件
              </p>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 text-xs leading-relaxed whitespace-pre-wrap text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                {row.target.bodyPreview || "（本文なし）"}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/20">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                バンドル（引き継ぎ元）
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {row.bundle.title?.trim() || "（タイトルなし）"}
              </p>
              <p className="mt-2 text-[11px] text-emerald-900/80 dark:text-emerald-200/90">
                画像 {row.bundle.imageCount} 枚（アップロード {row.bundle.imageUploadedCount} / AI生成{" "}
                {row.bundle.imageGeneratedCount}）・チャット {row.bundle.chatThreadCount} スレッド
              </p>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-emerald-200/70 bg-white p-2 text-xs leading-relaxed whitespace-pre-wrap text-zinc-800 dark:border-emerald-900/40 dark:bg-zinc-950 dark:text-zinc-200">
                {row.bundle.bodyPreview || "（本文なし）"}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <strong className="font-medium">本文を結合</strong>
            ：既存の本文の後にバンドル側の本文を追記します。追記・画像・タグなどは足しますが、
            <strong className="font-medium"> バンドル側のチャット履歴は取り込みません</strong>
            （既存スレッドはそのままです）。
            <span className="mt-1 block">
              <strong className="font-medium">バンドルで上書き</strong>
              ：この日付の既存日記・画像・チャットなどは削除され、バンドル版で置き換わります。
            </span>
          </div>
        </div>
        <footer className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <ChoicePill selected={choice === "skip"} onClick={() => onPick("skip")}>
              スキップ
            </ChoicePill>
            <ChoicePill selected={choice === "merge"} onClick={() => onPick("merge")}>
              本文を結合
            </ChoicePill>
            <ChoicePill selected={choice === "replace"} onClick={() => onPick("replace")}>
              バンドルで上書き
            </ChoicePill>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            閉じる
          </button>
        </footer>
      </div>
    </ResponsiveDialog>
  );
}

function ImportSettingsCompareModal(props: {
  open: boolean;
  row: { key: string; bundleText: string; targetText: string } | null;
  onClose: () => void;
}) {
  const { open, row, onClose } = props;
  if (!row) return null;
  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      labelledBy="import-settings-compare-title"
      dialogId="import-settings-compare"
      presentation="island"
      zClass="z-[60]"
      panelClassName="max-w-4xl"
    >
      <div className="flex max-h-[min(90dvh,44rem)] flex-col">
        <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="import-settings-compare-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            設定の比較: <span className="font-mono">{row.key}</span>
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            JSON 形式のプレビューです。長い値は省略されていることがあります。
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-zinc-500">引き継ぎ元（バンドル）</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-emerald-200/80 bg-zinc-50 p-2 text-[11px] leading-snug whitespace-pre-wrap text-zinc-800 dark:border-emerald-900/50 dark:bg-zinc-950 dark:text-zinc-200">
                {row.bundleText}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-zinc-500">現アカウント</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[11px] leading-snug whitespace-pre-wrap text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                {row.targetText}
              </pre>
            </div>
          </div>
        </div>
        <footer className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            閉じる
          </button>
        </footer>
      </div>
    </ResponsiveDialog>
  );
}

function ImportPreviewStatDetailModal(props: {
  open: boolean;
  label: string | null;
  dryRun: DryRun;
  onClose: () => void;
}) {
  const { open, label, dryRun, onClose } = props;
  if (!label) return null;

  const d = dryRun.importPreviewDetail;
  const c = dryRun.importPreviewCounts;
  const blobs = dryRun.importPreviewBlobs;

  let body: React.ReactNode = null;
  if (label === "日記") {
    body = (
      <div className="space-y-2 text-[11px]">
        <p className="text-zinc-500">
          既定プレビュー（重複日はスキップ）で<strong className="font-medium text-zinc-700 dark:text-zinc-300"> 新規に作られる日記の日付</strong>
          です。「日付」タブの選択を変えると変わります。
        </p>
        {d.entryDatesYmd.length > 0 ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono">
            {d.entryDatesYmd.map((ymd) => (
              <li
                key={ymd}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/60"
              >
                {formatYmdJa(ymd)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">このプレビューでは新規日記がありません。</p>
        )}
        {c.skippedE2eeEntries > 0 ? (
          <p className="text-amber-700 dark:text-amber-300">
            バンドル注記: E2EE で引き継ぎ対象外の日記が {c.skippedE2eeEntries} 件含まれます。
          </p>
        ) : null}
      </div>
    );
  } else if (label === "画像") {
    body = (
      <div className="space-y-2 text-[11px]">
        <p className="text-zinc-500">
          取り込みプレビューに含まれる画像の件数です。サムネイルは表示しません。
        </p>
        <ul className="space-y-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
          <li className="flex justify-between">
            <span>合計</span>
            <span className="font-mono">{c.images} 件</span>
          </li>
          <li className="flex justify-between">
            <span>アップロード</span>
            <span className="font-mono">{d.imageByKind.uploaded} 件</span>
          </li>
          <li className="flex justify-between">
            <span>AI 生成</span>
            <span className="font-mono">{d.imageByKind.generated} 件</span>
          </li>
          <li className="flex justify-between border-t border-zinc-200 pt-1 dark:border-zinc-700">
            <span>バンドル内サイズ（目安）</span>
            <span className="font-mono">{formatBytes(blobs.totalBytes)}</span>
          </li>
        </ul>
      </div>
    );
  } else if (label === "チャットメッセージ") {
    body = (
      <div className="space-y-2 text-[11px]">
        <p className="text-zinc-500">
          メッセージ総数 {c.chatMessages} 件。関連するスレッド（日付・タイトル）の一覧です。
        </p>
        {d.chatThreadSummaries.length > 0 ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {d.chatThreadSummaries.map((line, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/60"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">スレッドはありません。</p>
        )}
      </div>
    );
  } else if (label === "タグ") {
    body =
      d.tagNames.length > 0 ? (
        <ul className="max-h-56 flex flex-wrap gap-1 overflow-y-auto">
          {d.tagNames.map((name) => (
            <li
              key={name}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-900/60"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-zinc-500">タグはありません。</p>
      );
  } else if (label === "アプリカレンダー") {
    body =
      d.appLocalCalendarNames.length > 0 ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px]">
          {d.appLocalCalendarNames.map((name) => (
            <li
              key={name}
              className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">アプリ内カレンダーはこのプレビューに含まれません。</p>
      );
  } else if (label === "Googleカレンダーキャッシュ") {
    body = (
      <div className="text-[11px]">
        <p className="mb-2 text-zinc-500">
          イベント {c.googleCalendarEvents} 件。先頭のタイトル例です。
        </p>
        {d.googleCalendarSampleTitles.length > 0 ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {d.googleCalendarSampleTitles.map((t, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700"
              >
                {t}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">イベントはありません。</p>
        )}
      </div>
    );
  } else if (label === "長期メモリ") {
    body = (
      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
        長期メモリは <span className="font-mono">{d.memoryLongTermCount}</span>{" "}
        件がプレビューに含まれます（本文はバンドル内の構造化データのため、この画面では件数のみ表示します）。
      </p>
    );
  } else if (label === "短期メモリ") {
    body =
      d.memoryShortTermEntryDates.length > 0 ? (
        <div className="text-[11px]">
          <p className="mb-2 text-zinc-500">関連する日記の日付（重複除く）:</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono">
            {d.memoryShortTermEntryDates.map((ymd) => (
              <li
                key={ymd}
                className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700"
              >
                {formatYmdJa(ymd)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-zinc-500">短期メモリはありません。</p>
      );
  } else if (label === "エージェントメモリ") {
    body =
      d.agentMemoryLines.length > 0 ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px] leading-snug">
          {d.agentMemoryLines.map((line, i) => (
            <li
              key={i}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">エージェントメモリはありません。</p>
      );
  } else if (label === "使用量カウンター") {
    body =
      d.usageCounterDatesYmd.length > 0 ? (
        <div className="text-[11px]">
          <p className="mb-2 text-zinc-500">
            日別カウンター {c.usageCounters} 件。対象日付（先頭から）:
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono">
            {d.usageCounterDatesYmd.map((ymd) => (
              <li
                key={ymd}
                className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700"
              >
                {ymd}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-zinc-500">使用量カウンターはこのプレビューに含まれません。</p>
      );
  } else if (label != null) {
    body = <p className="text-[11px] text-zinc-500">この項目の内訳表示は未対応です。</p>;
  }

  if (body == null) {
    body = <p className="text-[11px] text-zinc-500">内訳がありません。</p>;
  }

  return (
    <ResponsiveDialog
      open={open && label !== null}
      onClose={onClose}
      labelledBy="import-stat-detail-title"
      dialogId="import-stat-detail"
      presentation="island"
      zClass="z-[60]"
      panelClassName="max-w-lg"
    >
      <div className="flex max-h-[min(88dvh,36rem)] flex-col">
        <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="import-stat-detail-title"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {label}の詳細
          </h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
        <footer className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            閉じる
          </button>
        </footer>
      </div>
    </ResponsiveDialog>
  );
}

function ImportSettingsConflictDetails(props: {
  name: string;
  className: string;
  initiallyOpen: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  const { name, className, initiallyOpen, summary, children } = props;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    if (!initiallyOpen) return;
    const el = detailsRef.current;
    if (el) el.open = true;
  }, [initiallyOpen]);

  return (
    <details ref={detailsRef} name={name} className={className}>
      {summary}
      {children}
    </details>
  );
}

function ImportReviewStep(props: {
  dryRun: DryRun;
  chosen: Record<string, "source" | "target">;
  onChoose: (key: string, value: "source" | "target") => void;
  reviewTab: "overview" | "dates" | "settings";
  onReviewTab: (t: "overview" | "dates" | "settings") => void;
  overlapChoices: Record<string, OverlapChoice>;
  onOverlapChoice: (ymd: string, c: OverlapChoice) => void;
  onResetAllOverlapsToSkip: () => void;
  detailYmd: string | null;
  onDetailYmd: (ymd: string | null) => void;
  dropsBundledGlobalSnapshotEffective: boolean;
}) {
  const {
    dryRun,
    chosen,
    onChoose,
    reviewTab,
    onReviewTab,
    overlapChoices,
    onOverlapChoice,
    onResetAllOverlapsToSkip,
    detailYmd,
    onDetailYmd,
    dropsBundledGlobalSnapshotEffective,
  } = props;
  const [statModalLabel, setStatModalLabel] = useState<string | null>(null);
  const [settingsCompareKey, setSettingsCompareKey] = useState<string | null>(null);
  const c = dryRun.importPreviewCounts;
  const bundleCounts = dryRun.summary.counts;
  const plan = dryRun.importPlan;

  const stats = useMemo(
    () =>
      [
        ["日記", c.dailyEntries],
        ["画像", c.images],
        ["チャットメッセージ", c.chatMessages],
        ["タグ", c.tags],
        ["アプリカレンダー", c.appLocalCalendars],
        ["Googleカレンダーキャッシュ", c.googleCalendarEvents],
        ["長期メモリ", c.memoryLongTerm],
        ["短期メモリ", c.memoryShortTerm],
        ["エージェントメモリ", c.agentMemory],
        ["使用量カウンター", c.usageCounters],
      ] as const,
    [c],
  );

  const detailRow = useMemo(
    () => dryRun.overlapDateRows.find((r) => r.entryDateYmd === detailYmd) ?? null,
    [dryRun.overlapDateRows, detailYmd],
  );

  const settingsCompareRow = useMemo(
    () =>
      dryRun.conflictingSettingsDetail.find((r) => r.key === settingsCompareKey) ?? null,
    [dryRun.conflictingSettingsDetail, settingsCompareKey],
  );

  const settingsConflictHasProfile = useMemo(
    () => dryRun.conflictingSettingsDetail.some((r) => r.key === "profile"),
    [dryRun.conflictingSettingsDetail],
  );

  return (
    <div className="space-y-4">
      {reviewTab === "overview" ? (
        <>
          <div className="rounded-xl border border-zinc-200 p-3 text-xs leading-relaxed dark:border-zinc-800">
            <p>
              <span className="text-zinc-500">バンドル発行元: </span>
              <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                {dryRun.summary.source.emailMasked}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              発行日時: {new Date(dryRun.summary.exportedAt).toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              取り込み対象の画像: {dryRun.importPreviewBlobs.count} 件 /{" "}
              {formatBytes(dryRun.importPreviewBlobs.totalBytes)}
            </p>
            {bundleCounts.skippedE2eeEntries > 0 && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                {bundleCounts.skippedE2eeEntries} 件の E2EE 暗号化日記は引き継ぎ対象外（v1の制限）です。
              </p>
            )}
          </div>

          {!plan.canImport && dryRun.overlapDateRows.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
              <p className="font-medium">重複日の扱いを選べます</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                いまはすべて「スキップ」相当です。「日付」タブで日ごとに上書き・本文結合を選ぶと取り込めます。
              </p>
            </div>
          ) : null}

          {dryRun.overlapDateRows.length === 0 && !dryRun.targetHasEntries ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              このアカウントに日記がまだありません。バンドルをそのまま取り込めます。
            </div>
          ) : null}

          {dryRun.overlapDateRows.length === 0 && dryRun.targetHasEntries ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/90 p-4 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
              既存日記と日付が重なっていません。バンドルの日付はすべて新規追加されます。
            </div>
          ) : null}

          {dropsBundledGlobalSnapshotEffective ? (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 px-2.5 py-2 text-[10px] leading-snug text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/20 dark:text-amber-100">
              <p className="font-semibold text-amber-900 dark:text-amber-200/95">
                カレンダー・使用量などのスナップショット
              </p>
              <p className="mt-0.5 opacity-95">
                重複日で「スキップ」または「本文を結合」を含む取り込みでは、バンドル内の
                <span className="whitespace-nowrap">アプリ／Google カレンダー・使用量・エージェント記憶</span>
                は載せません（このアカウントを優先）。
              </p>
            </div>
          ) : dryRun.importPlan.dropsBundledGlobalSnapshot && dryRun.targetHasEntries ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
              重複日をすべて「バンドルで上書き」にすると、上記スナップショットもバンドル優先で取り込める場合があります。
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              取り込みプレビュー（件数）
            </h3>
            {bundleCounts.dailyEntries !== c.dailyEntries && (
              <p className="mb-2 text-xs text-zinc-500">
                バンドル全体 {bundleCounts.dailyEntries} 日分のうち、既定どおりスキップすると新規作成は{" "}
                {c.dailyEntries} 日分です。重複日の選択を変えると変わります。
              </p>
            )}
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              {stats.map(([label, n]) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => setStatModalLabel(label)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left text-[11px] text-zinc-500 transition-colors hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60"
                  >
                    <span>{label}</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-zinc-400">各行をタップすると内訳を表示します。</p>
          </div>
        </>
      ) : null}

      {reviewTab === "dates" ? (
        <div className="space-y-4">
          {dryRun.newImportDates.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                新規に追加される日付
              </h3>
              <ul className="flex flex-wrap gap-2">
                {dryRun.newImportDates.map((ymd) => (
                  <li
                    key={ymd}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    {formatYmdJa(ymd)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">新規日付はありません（すべて既存日付と重なっています）。</p>
          )}

          {dryRun.overlapDateRows.length > 0 ? (
            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  日付が重なる日記（日ごとに選択）
                </h3>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    onClick={() => onResetAllOverlapsToSkip()}
                  >
                    重複分まとめてスキップ
                  </button>
                </div>
              </div>
              <ul className="space-y-2">
                {dryRun.overlapDateRows.map((row) => {
                  const ch = overlapChoices[row.entryDateYmd] ?? "skip";
                  const chLabel =
                    ch === "replace"
                      ? "上書き"
                      : ch === "merge"
                        ? "本文結合"
                        : "スキップ";
                  return (
                    <li key={row.entryDateYmd}>
                      <details
                        name="import-overlap-acc"
                        className="group overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-zinc-50/80 shadow-sm dark:border-zinc-700/90 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900/70 open:shadow-md"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-transform duration-200 group-open:rotate-90 dark:bg-zinc-800 dark:text-zinc-400">
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden
                            >
                              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                                {formatYmdJa(row.entryDateYmd)}
                              </span>
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                {chLabel}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                              本機 画像 {row.target.imageCount} 枚 · バンドル{" "}
                              {row.bundle.imageCount} 枚（↑{row.bundle.imageUploadedCount} / AI
                              {row.bundle.imageGeneratedCount}）
                            </p>
                          </div>
                        </summary>
                        <div className="border-t border-zinc-200/70 px-3 pb-3 pt-2 dark:border-zinc-700/70">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-2.5 dark:border-zinc-700/80 dark:bg-zinc-900/40">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                このアカウント
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs font-medium text-zinc-900 dark:text-zinc-50">
                                {row.target.title?.trim() || "（タイトルなし）"}
                              </p>
                              <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-white/90 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-950/80 dark:text-zinc-300">
                                {row.target.bodyPreview || "（本文なし）"}
                              </div>
                            </div>
                            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/25">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300/90">
                                バンドル
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs font-medium text-zinc-900 dark:text-zinc-50">
                                {row.bundle.title?.trim() || "（タイトルなし）"}
                              </p>
                              <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-emerald-200/50 bg-white/90 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700 dark:border-emerald-900/40 dark:bg-zinc-950/80 dark:text-zinc-300">
                                {row.bundle.bodyPreview || "（本文なし）"}
                              </div>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                            チャット: 本機 {row.target.chatThreadCount} スレ · バンドル{" "}
                            {row.bundle.chatThreadCount} スレ
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <ChoicePill
                              selected={ch === "skip"}
                              onClick={() => onOverlapChoice(row.entryDateYmd, "skip")}
                            >
                              スキップ
                            </ChoicePill>
                            <ChoicePill
                              selected={ch === "merge"}
                              onClick={() => onOverlapChoice(row.entryDateYmd, "merge")}
                            >
                              本文を結合
                            </ChoicePill>
                            <ChoicePill
                              selected={ch === "replace"}
                              onClick={() => onOverlapChoice(row.entryDateYmd, "replace")}
                            >
                              バンドルで上書き
                            </ChoicePill>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDetailYmd(row.entryDateYmd)}
                            className="mt-2 w-full rounded-lg border border-dashed border-zinc-300 py-1.5 text-[11px] text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                          >
                            フル画面で比較・選択
                          </button>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <ImportDateDetailModal
            open={detailYmd !== null}
            row={detailRow}
            choice={detailRow ? overlapChoices[detailRow.entryDateYmd] ?? "skip" : "skip"}
            onClose={() => onDetailYmd(null)}
            onPick={(pick) => {
              if (detailRow) onOverlapChoice(detailRow.entryDateYmd, pick);
            }}
          />
        </div>
      ) : null}

      {reviewTab === "settings" ? (
        <>
          {dryRun.conflictingSettingsDetail.length > 0 ? (
            <div>
              <h3 className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                設定の衝突解決
              </h3>
              <p className="mb-3 text-xs text-zinc-500">
                行を開いて JSON を並べて確認し、どちらを残すか選んでください。
              </p>
              <ul className="space-y-2">
                {dryRun.conflictingSettingsDetail.map((row, index) => {
                  const pick = chosen[row.key] ?? "target";
                  const pickLabel = pick === "source" ? "引き継ぎ元を採用" : "現アカウントを維持";
                  return (
                    <li key={row.key}>
                      <ImportSettingsConflictDetails
                        name="import-settings-acc"
                        className="group overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-violet-50/30 shadow-sm dark:border-zinc-700/90 dark:from-zinc-950 dark:via-zinc-950 dark:to-violet-950/20 open:shadow-md"
                        initiallyOpen={
                          row.key === "profile" ||
                          (index === 0 && !settingsConflictHasProfile)
                        }
                        summary={
                          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 transition-transform duration-200 group-open:rotate-90 dark:bg-violet-950/60 dark:text-violet-300">
                              <svg
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden
                              >
                                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <div className="min-w-0 flex-1">
                              <code className="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                                {row.key}
                              </code>
                              <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                現在の選択: {pickLabel}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              開く
                            </span>
                          </summary>
                        }
                      >
                        <div className="border-t border-zinc-200/70 px-3 pb-3 pt-2 dark:border-zinc-700/70">
                          <div className="grid gap-2 lg:grid-cols-2">
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                引き継ぎ元（バンドル）
                              </p>
                              <pre className="max-h-40 overflow-auto rounded-xl border border-emerald-200/60 bg-zinc-50/95 p-2 text-[10px] leading-snug whitespace-pre-wrap text-zinc-800 dark:border-emerald-900/40 dark:bg-zinc-950/90 dark:text-zinc-200">
                                {row.bundleText}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                現アカウント
                              </p>
                              <pre className="max-h-40 overflow-auto rounded-xl border border-zinc-200/80 bg-zinc-50/95 p-2 text-[10px] leading-snug whitespace-pre-wrap text-zinc-800 dark:border-zinc-700/80 dark:bg-zinc-950/90 dark:text-zinc-200">
                                {row.targetText}
                              </pre>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-zinc-500">採用:</span>
                            <ChoicePill
                              selected={chosen[row.key] === "source"}
                              onClick={() => onChoose(row.key, "source")}
                            >
                              引き継ぎ元
                            </ChoicePill>
                            <ChoicePill
                              selected={chosen[row.key] === "target"}
                              onClick={() => onChoose(row.key, "target")}
                            >
                              現アカウント
                            </ChoicePill>
                            <button
                              type="button"
                              onClick={() => setSettingsCompareKey(row.key)}
                              className="ml-auto text-[10px] font-medium text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                            >
                              拡大表示（モーダル）
                            </button>
                          </div>
                        </div>
                      </ImportSettingsConflictDetails>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              重複する設定キーはありません。バンドルにだけある設定は自動で補完されます。
            </p>
          )}
        </>
      ) : null}

      <ImportPreviewStatDetailModal
        open={statModalLabel !== null}
        label={statModalLabel}
        dryRun={dryRun}
        onClose={() => setStatModalLabel(null)}
      />
      <ImportSettingsCompareModal
        open={settingsCompareKey !== null}
        row={settingsCompareRow}
        onClose={() => setSettingsCompareKey(null)}
      />
    </div>
  );
}

