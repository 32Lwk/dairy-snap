"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";

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
};

function ImportFlow({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<ImportPhase>("input");
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [chosen, setChosen] = useState<Record<string, "source" | "target">>({});
  const [error, setError] = useState<string | null>(null);

  const canVerify = file !== null && passphrase.length >= 8;

  async function runDryRun() {
    if (!file) return;
    setError(null);
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
      };
      if (!res.ok) {
        setPhase("error");
        setError(json.error ?? "検証に失敗しました");
        return;
      }
      setDryRun(json);
      const initial: Record<string, "source" | "target"> = {};
      for (const k of json.conflictingSettingsKeys) initial[k] = "target";
      setChosen(initial);
      setPhase("review");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyImport() {
    if (!file || !dryRun) return;
    setError(null);
    setPhase("applying");
    const fd = new FormData();
    fd.append("bundle", file);
    fd.append("passphrase", passphrase);
    const sourceKeys = dryRun.summary.settingsKeys.filter(
      (k) => chosen[k] === "source" || !dryRun.conflictingSettingsKeys.includes(k),
    );
    fd.append("settingsSourceKeys", JSON.stringify(sourceKeys));
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

  return (
    <div className="flex max-h-[80vh] flex-col">
      <header className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2
          id="account-transfer-title"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          データのインポート
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          別環境でエクスポートしたバンドル(.dsbundle)とパスフレーズで、このアカウントへ取り込みます。
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-800 dark:text-zinc-100">
        {phase === "input" || phase === "verifying" ? (
          <ImportInputStep
            file={file}
            onFile={setFile}
            passphrase={passphrase}
            onPassphrase={setPassphrase}
            showPass={showPass}
            onToggleShow={() => setShowPass((v) => !v)}
            verifying={phase === "verifying"}
          />
        ) : null}

        {phase === "review" && dryRun && (
          <ImportReviewStep
            dryRun={dryRun}
            chosen={chosen}
            onChoose={(k, v) => setChosen((prev) => ({ ...prev, [k]: v }))}
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
            onClick={() => void applyImport()}
            disabled={dryRun.targetHasEntries}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            title={
              dryRun.targetHasEntries
                ? "このアカウントにはすでに日記があるためインポートできません"
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

function ImportInputStep(props: {
  file: File | null;
  onFile: (f: File | null) => void;
  passphrase: string;
  onPassphrase: (s: string) => void;
  showPass: boolean;
  onToggleShow: () => void;
  verifying: boolean;
}) {
  const { file, onFile, passphrase, onPassphrase, showPass, onToggleShow, verifying } = props;
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
        <p className="mt-1 text-xs text-zinc-500">
          パスフレーズは一定回数間違えると 30分のクールダウンが入ります。
        </p>
      </div>

      {verifying && (
        <p className="text-xs text-zinc-500">バンドルを復号して内容を確認しています…</p>
      )}
    </div>
  );
}

function ImportReviewStep(props: {
  dryRun: DryRun;
  chosen: Record<string, "source" | "target">;
  onChoose: (key: string, value: "source" | "target") => void;
}) {
  const { dryRun, chosen, onChoose } = props;
  const c = dryRun.summary.counts;

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
        <p>
          <span className="text-zinc-500">バンドル発行元: </span>
          <span className="font-mono">{dryRun.summary.source.emailMasked}</span>
        </p>
        <p className="text-zinc-500">
          発行日時: {new Date(dryRun.summary.exportedAt).toLocaleString()}
        </p>
        <p className="text-zinc-500">
          画像: {dryRun.summary.blobs.count}件 / 合計 {formatBytes(dryRun.summary.blobs.totalBytes)}
        </p>
        {dryRun.summary.counts.skippedE2eeEntries > 0 && (
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            {dryRun.summary.counts.skippedE2eeEntries} 件の E2EE 暗号化日記は引き継ぎ対象外（v1の制限）です。
          </p>
        )}
      </div>

      {dryRun.targetHasEntries ? (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-200">
          このアカウントにはすでに日記が保存されています。
          安全のため、まっさらなアカウントへのインポートのみ受け付けます。
          <br />
          別アカウントでログインするか、サポートへお問い合わせください。
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          現在のアカウントには日記がありません。下記内容でインポートできます。
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          取り込まれる件数（概算）
        </h3>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {stats.map(([label, n]) => (
            <li key={label} className="flex justify-between">
              <span className="text-zinc-500">{label}</span>
              <span className="font-mono">{n}</span>
            </li>
          ))}
        </ul>
      </div>

      {dryRun.conflictingSettingsKeys.length > 0 ? (
        <div>
          <h3 className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            設定の衝突解決
          </h3>
          <p className="mb-2 text-xs text-zinc-500">
            両方の環境にある設定項目について、どちらの値を残すかを選んでください。
          </p>
          <ul className="space-y-1.5">
            {dryRun.conflictingSettingsKeys.map((k) => (
              <li
                key={k}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-800"
              >
                <span className="truncate font-mono text-zinc-700 dark:text-zinc-200">{k}</span>
                <div className="flex shrink-0 gap-1">
                  <ChoicePill
                    selected={chosen[k] === "source"}
                    onClick={() => onChoose(k, "source")}
                  >
                    引き継ぎ元
                  </ChoicePill>
                  <ChoicePill
                    selected={chosen[k] === "target"}
                    onClick={() => onChoose(k, "target")}
                  >
                    現アカウント
                  </ChoicePill>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          重複する設定項目はありません。バンドル側にしかない設定は自動的に取り込まれます。
        </p>
      )}
    </div>
  );
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
