"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import Link from "next/link";
import { useEntriesNavDrawer } from "@/components/entries-nav-layout-shell";
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
    <div className="mx-auto w-full px-4 py-6 md:max-w-2xl lg:max-w-6xl">
      <header className="max-w-2xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/calendar/${date}`}
            className="hidden text-sm text-emerald-700 hover:underline dark:text-emerald-400 lg:inline"
          >
            ← カレンダー
          </Link>
          <button
            type="button"
            onClick={openNav}
            className="text-sm font-medium text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 lg:hidden"
            aria-expanded={isOpen}
            aria-controls="entries-nav-drawer"
          >
            エントリ一覧
          </button>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{date}</h1>
        <div className="mt-1 flex items-start justify-end gap-2 md:items-center">
          <p
            className={`min-w-0 flex-1 text-lg leading-snug ${
              initialTitle.trim() ? "text-zinc-700 dark:text-zinc-300" : "italic text-zinc-400 dark:text-zinc-500"
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
      </header>

      <EntryByDateMainGrid
        {...grid}
        entryId={entryId}
        journalDraftOpenPreviewSignal={journalDraftOpenPreviewSignal}
        savedEntryTitle={initialTitle}
        savedEntryTagsCsv={savedEntryTagsCsv}
      />
    </div>
  );
}
