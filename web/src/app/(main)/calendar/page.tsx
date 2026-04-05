import Link from "next/link";
import { redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";
import { UpcomingGoogleEvents } from "./upcoming-google-events";

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const sp = await searchParams;
  const now = new Date();
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = sp.ym && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : defaultYm;
  const { from, to } = monthRange(ym);

  const entries = await prisma.dailyEntry.findMany({
    where: { userId: r.user.id, entryDateYmd: { gte: from, lte: to } },
    select: { entryDateYmd: true, title: true },
    orderBy: { entryDateYmd: "asc" },
  });

  const has = new Set(entries.map((e) => e.entryDateYmd));

  const [yy, mm] = ym.split("-").map(Number);
  const firstDow = new Date(yy, mm - 1, 1).getDay();
  const daysInMonth = new Date(yy, mm, 0).getDate();

  const cells: { day: number; ymd: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, ymd });
  }

  const prev = new Date(yy, mm - 2, 1);
  const next = new Date(yy, mm, 1);
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const nextYm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">カレンダー</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">日記の有無と、Google の予定（未来30日）を一覧できます。</p>
      </header>

      <UpcomingGoogleEvents />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-800 dark:text-zinc-200">日記エントリ（月）</h2>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/calendar?ym=${prevYm}`}
          className="rounded-lg border border-zinc-200 px-3 py-1 text-sm dark:border-zinc-700"
        >
          前月
        </Link>
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{ym}</span>
        <Link
          href={`/calendar?ym=${nextYm}`}
          className="rounded-lg border border-zinc-200 px-3 py-1 text-sm dark:border-zinc-700"
        >
          翌月
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map(({ day, ymd }) => (
          <Link
            key={ymd}
            href={`/entries/${ymd}`}
            className={`block rounded-lg border py-2 text-sm ${
              has.has(ymd)
                ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
                : "border-zinc-100 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            {day}
          </Link>
        ))}
      </div>
    </div>
  );
}
