"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import Link from "next/link";
import { useEntriesNavDrawer } from "@/components/entries-nav-layout-shell";
import {
  APP_HEADER_TITLE,
  APP_HEADER_TOOLBAR_INNER,
  APP_MAIN_PT_BELOW_FIXED_HEADER_COMPACT,
} from "@/lib/app-header-toolbar";
import { EntryByDateMainGrid } from "./entry-by-date-main-grid";
import { EntryTitleWithEdit } from "./entry-title-with-edit";

type GridPayload = Omit<
  ComponentProps<typeof EntryByDateMainGrid>,
  "journalDraftOpenPreviewSignal" | "savedEntryTitle" | "savedEntryTagsCsv" | "entryId"
>;

export function EntryByDateView(
  props: GridPayload & {
    date: string;
    entryId: string;
    initialTitle: string;
    savedEntryTagsCsv: string;
    mood: string | null;
  },
) {
  const { date, entryId, initialTitle, savedEntryTagsCsv, mood, ...grid } = props;
  const [journalDraftOpenPreviewSignal, setJournalDraftOpenPreviewSignal] = useState(0);
  const { openNav, isOpen } = useEntriesNavDrawer();

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden w-full px-4 pb-1.5 sm:px-6 sm:pb-2 lg:px-6 xl:px-8 ${APP_MAIN_PT_BELOW_FIXED_HEADER_COMPACT}`}
    >
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
        <div className={`${APP_HEADER_TOOLBAR_INNER} w-full min-w-0 max-w-none`}>
          <div className="flex min-h-9 min-w-0 flex-1 items-center gap-x-3">
            <Link
              href={`/calendar/${date}`}
              className="hidden shrink-0 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400 lg:inline"
            >
              ← カレンダー
            </Link>
            <button
              type="button"
              onClick={openNav}
              className="shrink-0 text-xs font-medium text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 lg:hidden"
              aria-expanded={isOpen}
              aria-controls="entries-nav-drawer"
            >
              エントリ一覧
            </button>
            <h1 className={APP_HEADER_TITLE}>{date}</h1>
          </div>
        </div>
      </header>

      <div className="shrink-0 mt-1.5 space-y-1.5 sm:mt-2">
        <div className="flex items-start justify-end gap-2 md:items-center">
          <p
            className={`min-w-0 flex-1 text-base leading-snug ${
              initialTitle.trim()
                ? "text-zinc-700 dark:text-zinc-300"
                : "italic text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {initialTitle.trim() ? initialTitle : "タイトル未設定"}
          </p>
          <EntryTitleWithEdit
            entryId={entryId}
            initialTitle={initialTitle}
            onOpenJournalPreview={() => setJournalDraftOpenPreviewSignal((n) => n + 1)}
          />
        </div>
        {mood ? <p className="text-sm text-zinc-500">気分: {mood}</p> : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <EntryByDateMainGrid
          {...grid}
          entryId={entryId}
          journalDraftOpenPreviewSignal={journalDraftOpenPreviewSignal}
          savedEntryTitle={initialTitle}
          savedEntryTagsCsv={savedEntryTagsCsv}
        />
      </div>
    </div>
  );
}
