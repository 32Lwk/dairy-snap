"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";

function normalizeEntryTitle(raw: string): string {
  return raw
    .replace(/^[\s"'「『]+/, "")
    .replace(/[\s"'」』]+$/, "")
    .trim()
    .slice(0, 120);
}

/** 日記草案プレビュー（`journal-draft-panel`）のダイアログ見出し行と同じクラス構成 */
function journalPreviewDialogHeaderBar({
  titleId,
  onClose,
}: {
  titleId: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-zinc-100 px-3 py-2.5 pr-2 dark:border-zinc-800 sm:px-4 sm:py-3 sm:pr-3">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-50">
          AI 日記（草案）プレビュー
        </h2>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 sm:text-[11px]">
          本文・タグ・写真を確認のうえ反映してください（大きい画面では左右に並びます）。
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <span className="text-2xl font-light leading-none" aria-hidden>
          ×
        </span>
      </button>
    </div>
  );
}

export function EntryTitleWithEdit({
  entryId,
  initialTitle,
  /** 指定時は「編集」で AI 日記草案プレビュー（`JournalDraftPanel` と同じシート）を開く */
  onOpenJournalPreview,
}: {
  entryId: string;
  initialTitle: string;
  onOpenJournalPreview?: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const inputId = `${titleId}-title-input`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useJournalPreview = typeof onOpenJournalPreview === "function";

  useEffect(() => {
    if (!open) setDraft(initialTitle);
  }, [initialTitle, open]);

  async function save() {
    const t = normalizeEntryTitle(draft);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t.length > 0 ? t : null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          if (useJournalPreview) {
            onOpenJournalPreview();
            return;
          }
          setDraft(initialTitle);
          setOpen(true);
        }}
        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
      >
        編集
      </button>

      {useJournalPreview ? null : (
      <ResponsiveDialog
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        dialogId="entry-title-edit-dialog"
        presentation="sheetBottom"
      >
        <div className="flex max-h-[min(88dvh,88svh)] flex-col overflow-hidden">
          {journalPreviewDialogHeaderBar({ titleId, onClose: () => setOpen(false) })}
          <div className="space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400" htmlFor={inputId}>
                タイトル（エントリ）
              </label>
              <input
                id={inputId}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={120}
                placeholder="（空にするとタイトルなし）"
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-semibold leading-snug text-zinc-900 shadow-inner outline-none ring-emerald-500/20 placeholder:font-normal placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-2 sm:px-3 sm:text-base sm:leading-6 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </ResponsiveDialog>
      )}
    </>
  );
}
