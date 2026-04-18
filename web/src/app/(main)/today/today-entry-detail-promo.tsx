"use client";

import Link from "next/link";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";

const DETAIL_COPY =
  "\u753b\u50cf\u306e\u8ffd\u52a0\u30fb\u95b2\u89a7\u3001\u5929\u6c17\u30fb\u4f4d\u7f6e\u3001AI \u306b\u3088\u308b\u64cd\u4f5c\u3001\u8ffd\u8a18\u5c65\u6b74\u306e\u4e00\u89a7\u306f\u3001\u65e5\u4ed8\u3054\u3068\u306e\u8a73\u7d30\u30da\u30fc\u30b8\u3067\u307e\u3068\u3081\u3066\u884c\u3048\u307e\u3059\u3002";

export function TodayEntryDetailPromo({ entryDateYmd }: { entryDateYmd: string }) {
  const [open, setOpen] = useState(false);
  const href = `/entries/${entryDateYmd}`;

  return (
    <>
      <div className="ml-auto flex max-w-[11rem] shrink-0 flex-col items-end gap-0.5 text-right sm:max-w-[13rem]">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          詳細ページ
        </span>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[10px] font-medium text-zinc-500 underline decoration-zinc-400/50 underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            説明
          </button>
          <Link
            href={href}
            className="text-[11px] font-semibold text-emerald-700 underline decoration-emerald-700/25 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            title={DETAIL_COPY}
          >
            開く →
          </Link>
        </div>
      </div>

      <ResponsiveDialog
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="today-detail-promo-title"
        dialogId="today-detail-promo-dialog"
        zClass="z-[50]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800 md:pt-4">
          <h2 id="today-detail-promo-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            この日の詳細ページ
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {"\u9589\u3058\u308b"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{DETAIL_COPY}</p>
          <Link
            href={href}
            onClick={() => setOpen(false)}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            詳細ページを開く
          </Link>
        </div>
      </ResponsiveDialog>
    </>
  );
}
