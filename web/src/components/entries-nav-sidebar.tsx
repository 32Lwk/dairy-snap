"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EntryNavBrief } from "@/server/entries-nav";

function formatYmLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y}年${Number(m)}月`;
}

function groupEntriesByYm(entries: EntryNavBrief[]): [string, EntryNavBrief[]][] {
  const map = new Map<string, EntryNavBrief[]>();
  for (const e of entries) {
    const ym = e.entryDateYmd.slice(0, 7);
    const arr = map.get(ym) ?? [];
    arr.push(e);
    map.set(ym, arr);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function collectVisibleAnchors(root: HTMLElement): HTMLAnchorElement[] {
  return [...root.querySelectorAll<HTMLAnchorElement>("a[href^='/entries/']")].filter((a) => {
    const details = a.closest("details");
    return !details || details.open;
  });
}

export function EntriesNavSidebar({ entries }: { entries: EntryNavBrief[] }) {
  const pathname = usePathname() ?? "";
  const listRef = useRef<HTMLUListElement>(null);

  const selectedYmd =
    pathname.startsWith("/entries/") && pathname !== "/entries"
      ? pathname.replace("/entries/", "").split("/")[0]
      : null;

  const groups = useMemo(() => groupEntriesByYm(entries), [entries]);

  const [openYm, setOpenYm] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (entries.length > 0) s.add(entries[0].entryDateYmd.slice(0, 7));
    if (selectedYmd) s.add(selectedYmd.slice(0, 7));
    return s;
  });

  useEffect(() => {
    if (!selectedYmd) return;
    const ym = selectedYmd.slice(0, 7);
    setOpenYm((prev) => (prev.has(ym) ? prev : new Set(prev).add(ym)));
  }, [selectedYmd]);

  const moveFocus = useCallback((delta: number) => {
    const root = listRef.current;
    if (!root || entries.length === 0) return;
    const anchors = collectVisibleAnchors(root);
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
    <ul
      ref={listRef}
      className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4"
      role="list"
    >
      {groups.map(([ym, monthEntries]) => {
        const isOpen = openYm.has(ym);
        return (
          <li key={ym} className="list-none">
            <details
              open={isOpen}
              className="group rounded-lg border border-transparent"
              onToggle={(e) => {
                const el = e.currentTarget;
                setOpenYm((prev) => {
                  const next = new Set(prev);
                  if (el.open) next.add(ym);
                  else next.delete(ym);
                  return next;
                });
              }}
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden"
                onKeyDown={(e) => {
                  if (e.key === "j" || e.key === "J" || e.key === "k" || e.key === "K") e.stopPropagation();
                }}
              >
                <span className="tabular-nums">{formatYmLabel(ym)}</span>
                <span
                  className="shrink-0 text-zinc-400 transition-transform group-open:rotate-180 dark:text-zinc-500"
                  aria-hidden
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="block">
                    <path d="M6 8.5 1.5 4h9L6 8.5z" />
                  </svg>
                </span>
              </summary>
              <ul className="mt-0.5 space-y-1 border-l border-zinc-200 pl-2 dark:border-zinc-700" role="list">
                {monthEntries.map((e) => {
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
            </details>
          </li>
        );
      })}
    </ul>
  );
}
