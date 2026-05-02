import Link from "next/link";
import { redirect } from "next/navigation";
import { parseUserSettings } from "@/lib/user-settings";
import { getRecentEntriesForNav } from "@/server/entries-nav";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";

/** Mobile-only list; desktop list lives in `entries/layout.tsx` sidebar. */
export default async function EntriesIndexPage() {
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto w-full px-4 py-6 lg:hidden md:max-w-2xl">
        <header className="mb-6">
          <Link href="/today" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
            ← 今日
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">エントリ一覧</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            直近 {entries.length ? entries.length : 0} 件表示（新しい順）。全文検索は{" "}
            <Link href="/search" className="text-emerald-700 underline dark:text-emerald-400">
              検索
            </Link>
            へ。
          </p>
        </header>

        {entries.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">まだエントリがありません。</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.entryDateYmd}>
                <Link
                  href={`/entries/${e.entryDateYmd}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">{e.entryDateYmd}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-sm text-zinc-600 dark:text-zinc-400">
                    {e.title?.trim() || (e.mood ? `気分: ${e.mood}` : "（無題）")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 text-center lg:flex">
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          左の一覧から日付を選ぶと、ここにエントリの詳細が表示されます。
        </p>
        <Link
          href="/search"
          className="mt-4 text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
        >
          全文検索へ
        </Link>
      </div>
    </div>
  );
}
