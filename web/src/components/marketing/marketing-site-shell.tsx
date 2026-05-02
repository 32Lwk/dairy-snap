import { BrandOAuthLogo } from "@/components/marketing/brand-oauth-logo";
import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { href: "/home", label: "ホーム" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/terms", label: "利用規約" },
] as const;

export function MarketingSiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/home" className="flex items-center gap-3 no-underline">
            <BrandOAuthLogo
              size={48}
              className="h-12 w-12 shrink-0 rounded-2xl object-contain"
              priority
            />
            <span className="text-lg font-semibold tracking-tight">daily-snap</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="rounded-full bg-zinc-900 px-3 py-1.5 text-white no-underline dark:bg-zinc-100 dark:text-zinc-900"
            >
              ログイン
            </Link>
          </nav>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <footer className="border-t border-zinc-200 bg-white py-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 text-sm text-zinc-600 sm:px-6 dark:text-zinc-400">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="underline-offset-4 hover:underline">
                {item.label}
              </Link>
            ))}
          </div>
          <p className="text-xs leading-relaxed">
            © {new Date().getFullYear()} daily-snap — 個人向け日記サービス
          </p>
        </div>
      </footer>
    </div>
  );
}
