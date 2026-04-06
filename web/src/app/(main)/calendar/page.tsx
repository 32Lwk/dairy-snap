import Link from "next/link";
import { redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";
import { UpcomingGoogleEvents } from "./upcoming-google-events";
import { MonthGrid } from "./month-grid";

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
  const fromAt = new Date(`${from}T00:00:00+09:00`);
  const toAt = new Date(`${to}T23:59:59.999+09:00`);

  const entries = await prisma.dailyEntry.findMany({
    where: { userId: r.user.id, entryDateYmd: { gte: from, lte: to } },
    select: { entryDateYmd: true, title: true },
    orderBy: { entryDateYmd: "asc" },
  });

  // 初回表示を速くするため、DBキャッシュから当月の予定をサーバーで先に埋める
  const initialEvents = await prisma.googleCalendarEventCache.findMany({
    where: {
      userId: r.user.id,
      isCancelled: false,
      startAt: { gte: fromAt, lte: toAt },
    },
    orderBy: { startAt: "asc" },
    take: 5000,
    select: { title: true, startIso: true, endIso: true, location: true },
  });

  const [yy, mm] = ym.split("-").map(Number);
  const firstDow = new Date(yy, mm - 1, 1).getDay();
  const daysInMonth = new Date(yy, mm, 0).getDate();

  const prev = new Date(yy, mm - 2, 1);
  const next = new Date(yy, mm, 1);
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const nextYm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">カレンダー</h1>
      </header>

      <UpcomingGoogleEvents />

      <MonthGrid
        ym={ym}
        prevYm={prevYm}
        nextYm={nextYm}
        firstDow={firstDow}
        daysInMonth={daysInMonth}
        entries={entries}
        initialEvents={initialEvents.map((e) => ({ title: e.title, start: e.startIso, end: e.endIso, location: e.location }))}
      />
    </div>
  );
}
