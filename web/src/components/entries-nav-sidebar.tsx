"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { EntryNavBrief } from "@/server/entries-nav";

export function EntriesNavSidebar({ entries }: { entries: EntryNavBrief[] }) {
  const pathname = usePathname() ?? "";
  const listRef = useRef<HTMLUListElement>(null);

  const selectedYmd =
    pathname.startsWith("/entries/") && pathname !== "/entries"
      ? pathname.replace("/entries/", "").split("/")[0]
      : null;

  const moveFocus = useCallback((delta: number) => {
    const root = listRef.current;
    if (!root || entries.length === 0) return;
    const anchors = [...root.querySelectorAll<HTMLAnchorElement>("a[href^='/entries/']")];
    if (anchors.length === 0) return;
    const active = document.activeElement;
    let idx = anchors.findIndex((a) => a === active);
    if (idx < 0) idx = entries.findIndex((e) => e.entryDateYmd === selectedYmd);
    if (idx < 0) idx = 0;
    const next = Math.max(0, Math.min(anchors.length - 1, idx + delta));
    anchors[next]?.focus();
  }, [entries, selectedYmd]);

  useEffect(() => {
    if (!selectedYmd || !listRef.current) return;
    const a = listRef.current.querySelector<HTMLAnchorElement>(`a[href='/entries/${selectedYmd}']`);
    a?.focus();
  }, [selectedYmd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!listRef.current?.contains(document.activeElement)) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        moveFocus(1);
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        moveFocus(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveFocus]);

  if (entries.length === 0) {
    return <p className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">エントリがありません</p>;
  }

  return (
    <ul ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4" role="list">
      {entries.map((e) => {
        const active = selectedYmd === e.entryDateYmd;
        return (
          <li key={e.entryDateYmd}>
            <Link
              href={`/entries/${e.entryDateYmd}`}
              className={`flex min-h-12 flex-col justify-center rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "border-transparent text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
              }`}
              tabIndex={active ? 0 : -1}
            >
              <span className="font-medium tabular-nums">{e.entryDateYmd}</span>
              <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                {e.title?.trim() || (e.mood ? `気分: ${e.mood}` : "（無題）")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
