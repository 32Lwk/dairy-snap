import { formatGoogleCalendarDisplayName } from "@/lib/google-calendar-display";
import { isValidYmdTokyo } from "@/lib/time/tokyo";
import { parseUserSettings } from "@/lib/user-settings";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { fetchAppLocalEventsAsBriefs } from "@/server/app-local-calendar";
import { prisma } from "@/server/db";
import { notFound, redirect } from "next/navigation";
import { formatYmdTokyo } from "@/lib/time/tokyo";
import { PhotosDailyQuotaBadge } from "@/components/photos-daily-quota-badge";
import { CalendarClient } from "../calendar-client";

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export default async function CalendarByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const { date } = await params;
  if (!isValidYmdTokyo(date)) notFound();

  const userSettingsRow = await prisma.user.findUnique({
    where: { id: r.user.id },
    select: { settings: true },
  });
  const prof = parseUserSettings(userSettingsRow?.settings ?? {}).profile;
  if (!prof?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const ym = date.slice(0, 7);
  const todayYmd = formatYmdTokyo();
  const { from, to } = monthRange(ym);
  const fromAt = new Date(`${from}T00:00:00+09:00`);
  const toAt = new Date(`${to}T23:59:59.999+09:00`);

  const [entries, todayEntry] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { userId: r.user.id, entryDateYmd: { gte: from, lte: to } },
      select: { entryDateYmd: true, title: true },
      orderBy: { entryDateYmd: "asc" },
    }),
    prisma.dailyEntry.findUnique({
      where: { userId_entryDateYmd: { userId: r.user.id, entryDateYmd: todayYmd } },
      select: { images: { select: { id: true } } },
    }),
  ]);

  const [initialGcalRows, appLocalBriefs] = await Promise.all([
    prisma.googleCalendarEventCache.findMany({
      where: {
        userId: r.user.id,
        isCancelled: false,
        startAt: { gte: fromAt, lte: toAt },
      },
      orderBy: { startAt: "asc" },
      take: 5000,
      select: {
        id: true,
        eventId: true,
        title: true,
        startIso: true,
        endIso: true,
        location: true,
        description: true,
        fixedCategory: true,
        calendarName: true,
        calendarColorId: true,
        eventColorId: true,
        calendarId: true,
      },
    }),
    fetchAppLocalEventsAsBriefs(r.user.id, fromAt, toAt, { orderAsc: true, take: 2000 }),
  ]);

  const initialEvents = [
    ...initialGcalRows.map((e) => ({
      cacheId: e.id,
      eventId: e.eventId,
      title: e.title,
      start: e.startIso,
      end: e.endIso,
      location: e.location,
      description: e.description,
      ...(e.fixedCategory ? { fixedCategory: e.fixedCategory } : {}),
      calendarName: formatGoogleCalendarDisplayName(e.calendarId, e.calendarName),
      colorId: e.eventColorId ?? e.calendarColorId ?? "",
      calendarId: e.calendarId,
    })),
    ...appLocalBriefs.map((e) => ({
      eventId: e.eventId,
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location,
      description: e.description,
      calendarName: e.calendarName,
      colorId: e.colorId,
      calendarId: e.calendarId,
    })),
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const [yy, mm] = ym.split("-").map(Number);
  const monthStartWeekday = new Date(yy, mm - 1, 1).getDay();
  const daysInMonth = new Date(yy, mm, 0).getDate();

  const prev = new Date(yy, mm - 2, 1);
  const next = new Date(yy, mm, 1);
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const nextYm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const dailyLimit = 5;
  const remaining = Math.max(0, dailyLimit - (todayEntry?.images.length ?? 0));
  const resetAt = new Date(`${todayYmd}T00:00:00+09:00`);
  resetAt.setDate(resetAt.getDate() + 1);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-6 pt-[calc(4.5rem+env(safe-area-inset-top,0px))] md:max-w-2xl md:pt-[calc(4.75rem+env(safe-area-inset-top,0px))] lg:max-w-5xl xl:max-w-6xl">
      <div className="mb-3">
        <PhotosDailyQuotaBadge remaining={remaining} dailyLimit={dailyLimit} resetAt={resetAt} />
      </div>
      <CalendarClient
        ym={ym}
        prevYm={prevYm}
        nextYm={nextYm}
        monthStartWeekday={monthStartWeekday}
        daysInMonth={daysInMonth}
        entries={entries}
        selectedDateYmd={date}
        initialEvents={initialEvents}
      />
    </div>
  );
}
