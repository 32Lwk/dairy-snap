"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/today", label: "今日", match: (p: string) => p === "/today" || p === "/" },
  {
    href: "/calendar",
    label: "カレンダー",
    match: (p: string) => p.startsWith("/calendar") || p.startsWith("/entries"),
  },
  { href: "/settings", label: "設定", match: (p: string) => p.startsWith("/settings") },
] as const;

export function AppBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2 py-1.5 lg:max-w-6xl lg:gap-2 lg:px-6">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-xs font-medium transition-colors ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
