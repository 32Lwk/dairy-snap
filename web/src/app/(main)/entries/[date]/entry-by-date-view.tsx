"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import Link from "next/link";
import { useEntriesNavDrawer } from "@/components/entries-nav-layout-shell";
import { APP_HEADER_TOOLBAR_INNER, APP_MAIN_PT_BELOW_FIXED_HEADER_COMPACT } from "@/lib/app-header-toolbar";
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

  const titleLine = initialTitle.trim() ? initialTitle : "タイトル未設定";
  const subtitleClass = initialTitle.trim()
    ? "text-zinc-600 dark:text-zinc-400"
    : "italic text-zinc-400 dark:text-zinc-500";

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden w-full pb-1.5 sm:pb-2 ${APP_MAIN_PT_BELOW_FIXED_HEADER_COMPACT}`}
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
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center gap-0.5">
              <h1 className="truncate text-xl font-bold leading-none text-zinc-900 dark:text-zinc-50">{date}</h1>
              <p className={`truncate text-[10px] leading-tight sm:text-[11px] ${subtitleClass}`}>
                {titleLine}
                {mood ? ` · 気分: ${mood}` : ""}
              </p>
            </div>
            <EntryTitleWithEdit
              entryId={entryId}
              initialTitle={initialTitle}
              variant="toolbar"
              onOpenJournalPreview={() => setJournalDraftOpenPreviewSignal((n) => n + 1)}
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden max-md:overflow-y-auto max-md:overscroll-y-contain md:overflow-hidden">
        <div className="min-h-0 w-full flex-1 px-4 sm:px-6 lg:px-6 xl:px-8 md:flex md:min-h-0 md:flex-col">
          <EntryByDateMainGrid
            {...grid}
            entryId={entryId}
            journalDraftOpenPreviewSignal={journalDraftOpenPreviewSignal}
            savedEntryTitle={initialTitle}
            savedEntryTagsCsv={savedEntryTagsCsv}
          />
        </div>
      </div>
    </div>
  );
}
