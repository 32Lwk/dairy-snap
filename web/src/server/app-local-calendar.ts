import {
  formatAppLocalCalendarDisplayName,
  isAppLocalCalendarId,
  stripAppLocalCalendarIdToken,
  toAppLocalCalendarIdToken,
} from "@/lib/app-local-calendar-id";
import { prisma } from "@/server/db";
import type { CalendarEventBrief, CalendarEventWriteFields } from "@/server/calendar";

/** Google と同様に終日の終了日は排他端（0 時）として格納する。 */
function dateFromIsoLikeTokyo(isoLike: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) {
    return new Date(`${isoLike}T00:00:00+09:00`);
  }
  return new Date(isoLike);
}

function addCalendarDaysYmdTokyo(ymd: string, deltaDays: number): string {
  const ms = Date.parse(`${ymd}T12:00:00+09:00`) + deltaDays * 86400000;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(ms))
    .replaceAll("/", "-");
}

function computeStartEndFromWriteFields(fields: CalendarEventWriteFields): { startIso: string; endIso: string } | null {
  if (fields.allDay) {
    const start = fields.allDayStartYmd.trim();
    const endInc = fields.allDayEndInclusiveYmd.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(endInc)) return null;
    if (Date.parse(`${start}T00:00:00+09:00`) > Date.parse(`${endInc}T00:00:00+09:00`)) return null;
    const endExclusive = addCalendarDaysYmdTokyo(endInc, 1);
    return { startIso: start, endIso: endExclusive };
  }
  const s = fields.startLocal.trim();
  const en = fields.endLocal.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(en)) {
    return null;
  }
  const startCore = s.length === 16 ? `${s}:00` : s;
  const endCore = en.length === 16 ? `${en}:00` : en;
  const startMs = Date.parse(`${startCore}+09:00`);
  const endMs = Date.parse(`${endCore}+09:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;
  return {
    startIso: `${startCore}+09:00`,
    endIso: `${endCore}+09:00`,
  };
}

const MAX_APP_LOCAL_CALENDARS = 24;

export async function listAppLocalCalendarsForUser(userId: string) {
  return prisma.appLocalCalendar.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function createAppLocalCalendar(userId: string, nameRaw: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = nameRaw.normalize("NFKC").trim();
  if (name.length < 1 || name.length > 80) {
    return { ok: false, error: "カレンダー名は1〜80文字にしてください" };
  }
  const n = await prisma.appLocalCalendar.count({ where: { userId } });
  if (n >= MAX_APP_LOCAL_CALENDARS) {
    return { ok: false, error: `アプリ内カレンダーは${MAX_APP_LOCAL_CALENDARS}件までです` };
  }
  const row = await prisma.appLocalCalendar.create({
    data: { userId, name },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function fetchAppLocalEventsAsBriefs(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  options: {
    scopedCalendarIdToken?: string;
    orderAsc: boolean;
    take: number;
  },
): Promise<CalendarEventBrief[]> {
  const scoped = (options.scopedCalendarIdToken ?? "").trim();
  const rawCalId = isAppLocalCalendarId(scoped) ? stripAppLocalCalendarIdToken(scoped) : "";

  const rows = await prisma.appLocalCalendarEvent.findMany({
    where: {
      userId,
      startAt: { lte: timeMax },
      endAt: { gte: timeMin },
      ...(rawCalId ? { calendarId: rawCalId } : {}),
    },
    include: { calendar: { select: { name: true } } },
    orderBy: { startAt: options.orderAsc ? "asc" : "desc" },
    take: Math.min(Math.max(options.take, 1), 5000),
  });

  return rows.map((r) => ({
    eventId: r.id,
    calendarId: toAppLocalCalendarIdToken(r.calendarId),
    calendarName: formatAppLocalCalendarDisplayName(r.calendar.name),
    colorId: "10",
    title: r.title,
    start: r.startIso,
    end: r.endIso,
    location: r.location,
    description: r.description,
  }));
}

function mergeAndSortBriefs(
  a: CalendarEventBrief[],
  b: CalendarEventBrief[],
  orderAsc: boolean,
  maxTotal: number,
): CalendarEventBrief[] {
  const out = [...a, ...b].filter((e) => e.start);
  out.sort((x, y) => {
    const dx = Date.parse(x.start) - Date.parse(y.start);
    return orderAsc ? dx : -dx;
  });
  return out.slice(0, maxTotal);
}

export async function mergeAppLocalEventsIntoGoogleList(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  googleEvents: CalendarEventBrief[],
  opts: { scopedCalendarId?: string; scopeOneCalendar: boolean; limit: number },
): Promise<CalendarEventBrief[]> {
  const scoped = (opts.scopedCalendarId ?? "").trim();
  const scopeOne = opts.scopeOneCalendar;
  const orderAsc = !scopeOne;

  if (scopeOne && scoped && !isAppLocalCalendarId(scoped)) {
    return googleEvents;
  }

  if (scopeOne && scoped && isAppLocalCalendarId(scoped)) {
    return fetchAppLocalEventsAsBriefs(userId, timeMin, timeMax, {
      scopedCalendarIdToken: scoped,
      orderAsc: false,
      take: opts.limit,
    });
  }

  const local = await fetchAppLocalEventsAsBriefs(userId, timeMin, timeMax, {
    orderAsc,
    take: Math.min(2000, opts.limit),
  });
  return mergeAndSortBriefs(googleEvents, local, orderAsc, opts.limit);
}

export async function assertAppLocalCalendarOwned(userId: string, rawCalendarId: string): Promise<boolean> {
  const n = await prisma.appLocalCalendar.count({
    where: { id: rawCalendarId, userId },
  });
  return n > 0;
}

export async function insertAppLocalCalendarEvent(
  userId: string,
  calendarIdToken: string,
  fields: CalendarEventWriteFields,
): Promise<{ ok: true; event: CalendarEventBrief } | { ok: false; error: string }> {
  if (!isAppLocalCalendarId(calendarIdToken)) {
    return { ok: false, error: "アプリ内カレンダーを選んでください" };
  }
  const rawCal = stripAppLocalCalendarIdToken(calendarIdToken);
  if (!rawCal) {
    return { ok: false, error: "アプリ内カレンダーが不正です" };
  }
  if (!(await assertAppLocalCalendarOwned(userId, rawCal))) {
    return { ok: false, error: "カレンダーが見つかりません" };
  }
  const summary = fields.summary.normalize("NFKC").trim();
  if (!summary) return { ok: false, error: "タイトルを入力してください" };
  const se = computeStartEndFromWriteFields(fields);
  if (!se) return { ok: false, error: "日時が不正です" };

  const description = fields.description.normalize("NFKC").slice(0, 500_000);
  const location = fields.location.normalize("NFKC").trim().slice(0, 2000);

  const row = await prisma.appLocalCalendarEvent.create({
    data: {
      userId,
      calendarId: rawCal,
      title: summary,
      description,
      location,
      startIso: se.startIso,
      endIso: se.endIso,
      startAt: dateFromIsoLikeTokyo(se.startIso),
      endAt: dateFromIsoLikeTokyo(se.endIso),
    },
    include: { calendar: { select: { name: true } } },
  });

  const event: CalendarEventBrief = {
    eventId: row.id,
    calendarId: toAppLocalCalendarIdToken(row.calendarId),
    calendarName: formatAppLocalCalendarDisplayName(row.calendar.name),
    colorId: "10",
    title: row.title,
    start: row.startIso,
    end: row.endIso,
    location: row.location,
    description: row.description,
  };
  return { ok: true, event };
}

export async function patchAppLocalCalendarEvent(
  userId: string,
  calendarIdToken: string,
  eventId: string,
  fields: CalendarEventWriteFields,
): Promise<{ ok: true; event: CalendarEventBrief } | { ok: false; error: string }> {
  const rawCal = stripAppLocalCalendarIdToken(calendarIdToken);
  if (!rawCal) return { ok: false, error: "カレンダーが不正です" };

  const existing = await prisma.appLocalCalendarEvent.findFirst({
    where: { id: eventId, userId, calendarId: rawCal },
    include: { calendar: { select: { name: true } } },
  });
  if (!existing) return { ok: false, error: "予定が見つかりません" };

  const summary = fields.summary.normalize("NFKC").trim();
  if (!summary) return { ok: false, error: "タイトルを入力してください" };
  const se = computeStartEndFromWriteFields(fields);
  if (!se) return { ok: false, error: "日時が不正です" };
  const description = fields.description.normalize("NFKC").slice(0, 500_000);
  const location = fields.location.normalize("NFKC").trim().slice(0, 2000);

  const row = await prisma.appLocalCalendarEvent.update({
    where: { id: eventId },
    data: {
      title: summary,
      description,
      location,
      startIso: se.startIso,
      endIso: se.endIso,
      startAt: dateFromIsoLikeTokyo(se.startIso),
      endAt: dateFromIsoLikeTokyo(se.endIso),
    },
    include: { calendar: { select: { name: true } } },
  });

  const event: CalendarEventBrief = {
    eventId: row.id,
    calendarId: toAppLocalCalendarIdToken(row.calendarId),
    calendarName: formatAppLocalCalendarDisplayName(row.calendar.name),
    colorId: "10",
    title: row.title,
    start: row.startIso,
    end: row.endIso,
    location: row.location,
    description: row.description,
  };
  return { ok: true, event };
}

export async function deleteAppLocalCalendar(
  userId: string,
  rawCalendarId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = (rawCalendarId ?? "").trim();
  if (!id) return { ok: false, error: "カレンダーが不正です" };
  const deleted = await prisma.appLocalCalendar.deleteMany({
    where: { id, userId },
  });
  if (deleted.count === 0) return { ok: false, error: "カレンダーが見つかりません" };
  return { ok: true };
}

export async function renameAppLocalCalendar(
  userId: string,
  rawCalendarId: string,
  nameRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = (rawCalendarId ?? "").trim();
  if (!id) return { ok: false, error: "カレンダーが不正です" };
  const name = nameRaw.normalize("NFKC").trim();
  if (name.length < 1 || name.length > 80) {
    return { ok: false, error: "カレンダー名は1〜80文字にしてください" };
  }
  const updated = await prisma.appLocalCalendar.updateMany({
    where: { id, userId },
    data: { name },
  });
  if (updated.count === 0) return { ok: false, error: "カレンダーが見つかりません" };
  return { ok: true };
}
