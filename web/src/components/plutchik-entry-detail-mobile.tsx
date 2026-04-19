"use client";

import { useState } from "react";
import { PlutchikDominantChip } from "@/components/plutchik-dominant-chip";
import { PlutchikWheel } from "@/components/plutchik-wheel";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { PlutchikStoredAnalysis } from "@/lib/emotion/plutchik";

/**
 * エントリ右欄：スマホはチップ＋「詳しく」、md 以上はチップ＋コンパクト円環をまとめてタップ可能。
 * タップで島モーダルに大きい円環と凡例を表示する。
 */
export function PlutchikEntryDetailMobile({
  dominantKey,
  analysis,
}: {
  dominantKey: string | null;
  analysis: PlutchikStoredAnalysis | null;
}) {
  const [open, setOpen] = useState(false);
  const titleId = "entry-plutchik-detail-dialog-title";

  if (!dominantKey && !analysis) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-xl border border-transparent p-1 text-left outline-none ring-emerald-500/25 transition hover:border-zinc-200 hover:bg-zinc-50/90 focus-visible:ring-2 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="entry-plutchik-detail-dialog"
          aria-label="感情の分析を開く"
        >
          <PlutchikDominantChip dominantKey={dominantKey} />
          {analysis ? (
            <span className="hidden md:inline-flex" aria-hidden="true">
              <PlutchikWheel analysis={analysis} phase="ready" compact />
            </span>
          ) : null}
          <span className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm md:hidden dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
            詳しく
          </span>
        </button>
      </div>

      <ResponsiveDialog
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        dialogId="entry-plutchik-detail-dialog"
        presentation="island"
        zClass="z-[58]"
        panelClassName="max-h-[min(90dvh,52rem)] min-h-0 w-full max-w-lg"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              感情の分析
            </h2>
            <PlutchikDominantChip dominantKey={dominantKey} />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex w-full min-w-0 justify-center">
            <PlutchikWheel analysis={analysis} phase="ready" compact={false} />
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            8 原感情ごとの強度は、会話の内容から推定した参考値です。
          </p>
        </div>
      </ResponsiveDialog>
    </>
  );
}
