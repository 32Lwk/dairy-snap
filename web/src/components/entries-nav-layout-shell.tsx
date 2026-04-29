"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { EntriesNavSidebar } from "@/components/entries-nav-sidebar";
import type { EntryNavBrief } from "@/server/entries-nav";

type DrawerCtx = {
  openNav: () => void;
  closeNav: () => void;
  isOpen: boolean;
};

const EntriesNavDrawerContext = createContext<DrawerCtx | null>(null);

export function useEntriesNavDrawer(): DrawerCtx {
  return (
    useContext(EntriesNavDrawerContext) ?? {
      openNav: () => {},
      closeNav: () => {},
      isOpen: false,
    }
  );
}

export function EntriesNavLayoutShell({
  entries,
  navPageSize,
  children,
}: {
  entries: EntryNavBrief[];
  navPageSize: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const open = openForPath === pathname;

  const openNav = useCallback(() => setOpenForPath(pathname), [pathname]);
  const closeNav = useCallback(() => setOpenForPath(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNav();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeNav]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const ctx: DrawerCtx = { openNav, closeNav, isOpen: open };

  return (
    <EntriesNavDrawerContext.Provider value={ctx}>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[55] bg-zinc-950/45 lg:hidden"
          aria-label="エントリ一覧を閉じる"
          onClick={closeNav}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row lg:items-stretch">
        <aside
          id="entries-nav-drawer"
          className={[
            "flex min-h-0 w-72 max-w-[min(100vw-1rem,18rem)] shrink-0 flex-col border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40",
            "fixed left-0 top-0 z-[60] h-[100dvh] max-h-[100dvh] border-r shadow-xl transition-transform duration-300 ease-out",
            "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] lg:static lg:z-auto lg:h-auto lg:max-h-[calc(100dvh-1rem)] lg:max-w-none lg:border-r lg:pt-0 lg:pb-0 lg:shadow-none",
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            !open ? "pointer-events-none invisible lg:pointer-events-auto lg:visible" : "",
          ].join(" ")}
        >
          <div className="shrink-0 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <Link href="/today" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">
                ← 今日
              </Link>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
                onClick={closeNav}
                aria-label="一覧を閉じる"
              >
                閉じる
              </button>
            </div>
            <h2 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">エントリ一覧</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              直近 {navPageSize} 件。j / k で移動（リストにフォーカス時）。
            </p>
            <Link
              href="/search"
              className="mt-2 inline-block text-[11px] text-emerald-700 underline dark:text-emerald-400"
            >
              全文検索
            </Link>
          </div>
          <EntriesNavSidebar entries={entries} />
        </aside>
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    </EntriesNavDrawerContext.Provider>
  );
}
