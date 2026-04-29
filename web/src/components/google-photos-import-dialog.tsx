"use client";

import { ResponsiveDialog } from "@/components/responsive-dialog";
import {
  openBlankGooglePhotosPickerWindow,
  runGooglePhotosPickerImport,
  startGooglePhotosPickerSession,
  type GooglePhotosPickerSessionStart,
} from "@/lib/google-photos-picker-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Phase = "intro" | "working" | "done" | "error";

export function GooglePhotosImportDialog({
  open,
  onClose,
  entryDateYmd,
  entryId,
  title = "Google Photos から追加",
  /** 同一ページに複数マウントする場合の id 衝突回避（例: actions / images） */
  instanceId = "default",
}: {
  open: boolean;
  onClose: () => void;
  entryDateYmd: string;
  entryId: string;
  /** ダイアログ見出し（画像欄用は短くできる） */
  title?: string;
  instanceId?: string;
}) {
  if (!open) return null;
  // open/close のたびに状態を初期化（react-hooks/set-state-in-effect を避ける）
  return (
    <GooglePhotosImportDialogInner
      key={`${entryId}:${entryDateYmd}:${instanceId}`}
      onClose={onClose}
      entryDateYmd={entryDateYmd}
      entryId={entryId}
      title={title}
      instanceId={instanceId}
    />
  );
}

function GooglePhotosImportDialogInner({
  onClose,
  entryDateYmd,
  entryId,
  title,
  instanceId,
}: {
  onClose: () => void;
  entryDateYmd: string;
  entryId: string;
  title: string;
  instanceId: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [prefetchedSession, setPrefetchedSession] = useState<GooglePhotosPickerSessionStart | null>(null);
  const [prefetchErr, setPrefetchErr] = useState<string | null>(null);

  useEffect(() => {
    // 体感速度改善: ダイアログを開いた時点で Picker セッションを先読みする（失敗しても start 時に再試行する）
    let cancelled = false;
    void (async () => {
      try {
        const prevErr = prefetchErr;
        if (prevErr) setPrefetchErr(null);
        const s = await startGooglePhotosPickerSession({ entryDateYmd, entryId });
        if (!cancelled) setPrefetchedSession(s);
      } catch (e) {
        if (!cancelled) setPrefetchErr(e instanceof Error ? e.message : "Google Photos の準備に失敗しました");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDateYmd, entryId]);

  const start = useCallback(async () => {
    setErrMsg(null);
    setResultMsg(null);
    setPhase("working");
    try {
      const outcome = await runGooglePhotosPickerImport({
        entryDateYmd,
        entryId,
        // クリック直後に空ポップアップを開く（ブロック回避 + ブロック検知）
        openPopup: () => openBlankGooglePhotosPickerWindow(),
        session: prefetchedSession ?? undefined,
      });
      if (!outcome.ok) {
        setErrMsg(outcome.error);
        setPhase("error");
        return;
      }
      setResultMsg(outcome.message);
      setPhase("done");
      router.refresh();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "取り込みに失敗しました");
      setPhase("error");
    }
  }, [entryDateYmd, entryId, prefetchedSession, router]);

  const idSuffix = instanceId.replace(/[^a-zA-Z0-9_-]/g, "") || "default";

  return (
    <ResponsiveDialog
      open={true}
      onClose={onClose}
      labelledBy={`google-photos-import-title-${idSuffix}`}
      dialogId={`google-photos-import-dialog-${idSuffix}`}
      zClass="z-[60]"
      presentation="island"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800 md:pt-4">
          <h2 id={`google-photos-import-title-${idSuffix}`} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 text-sm text-zinc-700 dark:text-zinc-300">
          {phase === "intro" ? (
            <div className="space-y-3">
              <p>
                Google の仕様により、写真の選択画面は<strong>このアプリ内の iframe には表示できません</strong>。
                代わりに<strong>中央のポップアップ</strong>で開きます（選択後は自動で閉じる設定です）。
              </p>
              {prefetchErr ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
                  {prefetchErr}
                </p>
              ) : null}
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                取り込み対象は<strong>撮影日（メタデータ）が「{entryDateYmd}」の東京の暦日と一致するものだけ</strong>です。別日の写真を選んでも日記には保存されません。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void start()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  ポップアップを開いて追加
                </button>
              </div>
            </div>
          ) : null}

          {phase === "working" ? (
            <div className="space-y-3">
              <p className="text-zinc-600 dark:text-zinc-400">ポップアップで写真を選び、完了してください。この画面は開いたままで構いません。</p>
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600 dark:border-zinc-600 dark:border-t-emerald-400" />
                取り込み待ち…
              </div>
            </div>
          ) : null}

          {phase === "done" && resultMsg ? (
            <div className="space-y-3">
              <p className="text-emerald-800 dark:text-emerald-200">{resultMsg}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                完了
              </button>
            </div>
          ) : null}

          {phase === "error" && errMsg ? (
            <div className="space-y-3">
              <p className="text-red-600 dark:text-red-400">{errMsg}</p>
              {errMsg.includes("ポップアップ") ? (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  <p className="font-medium">対処方法</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    <li>このサイトのポップアップを「許可」にしてください（アドレスバー右側のアイコンから変更できます）。</li>
                    <li>許可後、下の「もう一度開く」を押してください。</li>
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPhase("intro")}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  戻る
                </button>
                {errMsg.includes("ポップアップ") ? (
                  <button
                    type="button"
                    onClick={() => void start()}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                  >
                    もう一度開く
                  </button>
                ) : null}
                <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                  閉じる
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
