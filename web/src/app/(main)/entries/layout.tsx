import Link from "next/link";
import { redirect } from "next/navigation";
import { EntriesNavSidebar } from "@/components/entries-nav-sidebar";
import { parseUserSettings } from "@/lib/user-settings";
import { ENTRIES_NAV_PAGE_SIZE, getRecentEntriesForNav } from "@/server/entries-nav";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";

export default async function EntriesLayout({ children }: { children: React.ReactNode }) {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const userSettingsRow = await prisma.user.findUnique({
    where: { id: r.user.id },
    select: { settings: true },
  });
  const prof = parseUserSettings(userSettingsRow?.settings ?? {}).profile;
  if (!prof?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const entries = await getRecentEntriesForNav(r.user.id);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row lg:items-stretch">
      <aside className="hidden w-72 shrink-0 flex-col border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40 lg:flex lg:max-h-[calc(100dvh-1rem)] lg:border-r">
        <div className="shrink-0 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <Link href="/today" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">
            ← 今日
          </Link>
          <h2 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">エントリ一覧</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            直近 {ENTRIES_NAV_PAGE_SIZE} 件。j / k で移動（リストにフォーカス時）。
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
  );
}
