import { google, calendar_v3 } from "googleapis";
import { prisma } from "@/server/db";

export type CalendarEventBrief = {
  calendarId: string;
  calendarName: string;
  /** Googleの colorId（イベント色があれば優先、なければカレンダー色） */
  colorId: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
};

export type CalendarFetchFailureReason =
  | "no_google_account"
  | "no_refresh_token"
  | "oauth_not_configured"
  | "invalid_grant"
  | "calendar_api_error"
  | "unknown";

export type CalendarFetchResult =
  | { ok: true; events: CalendarEventBrief[] }
  | { ok: false; reason: CalendarFetchFailureReason; detail?: string };

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

type GoogleCalEvent = calendar_v3.Schema$Event;

function toBrief(ev: GoogleCalEvent, meta: { calendarId: string; calendarName: string; calendarColorId: string }): CalendarEventBrief {
  const eventColorId = ev.colorId ?? "";
  const colorId = eventColorId || meta.calendarColorId || "";
  return {
    calendarId: meta.calendarId,
    calendarName: meta.calendarName,
    colorId,
    title: ev.summary ?? "",
    start: ev.start?.dateTime ?? ev.start?.date ?? "",
    end: ev.end?.dateTime ?? ev.end?.date ?? "",
    location: ev.location ?? "",
    description: (ev.description ?? "").slice(0, 500),
  };
}

async function listReadableCalendars(cal: ReturnType<typeof google.calendar>): Promise<
  { id: string; name: string; colorId: string }[]
> {
  const items: { id: string; name: string; colorId: string }[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await cal.calendarList.list({
      minAccessRole: "reader",
      showHidden: false,
      maxResults: 250,
      pageToken,
    });
    for (const item of res.data.items ?? []) {
      if (!item.id) continue;
      // 共有や購読（webcal/iCal）もここに入る。無効/削除済みは除外。
      if (item.deleted) continue;
      items.push({
        id: item.id,
        name: item.summary ?? item.id,
        colorId: item.colorId ?? "",
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  // primary を先頭にして、重複排除
  const byId = new Map<string, { id: string; name: string; colorId: string }>();
  for (const it of items) {
    if (!byId.has(it.id)) byId.set(it.id, it);
  }
  const uniq = Array.from(byId.values());
  const primaryIdx = uniq.findIndex((x) => x.id === "primary");
  if (primaryIdx > 0) {
    const [p] = uniq.splice(primaryIdx, 1);
    uniq.unshift(p);
  }
  return uniq;
}

function sortKeyIso(start: string): number {
  const ms = Date.parse(start);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function dateFromIsoLikeTokyo(isoLike: string, isEnd: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) {
    const suffix = isEnd ? "T23:59:59.999+09:00" : "T00:00:00+09:00";
    return new Date(`${isoLike}${suffix}`);
  }
  return new Date(isoLike);
}

function computeRange(): { timeMin: Date; timeMax: Date } {
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 90);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 365);
  return { timeMin, timeMax };
}

function tokyoStartOfDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

function tokyoEndOfDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+09:00`);
}

async function syncGoogleCalendarCache(
  userId: string,
  cal: ReturnType<typeof google.calendar>,
  opts?: { forceSync?: boolean; minIntervalMs?: number },
) {
  const { timeMin, timeMax } = computeRange();
  const calendars = await listReadableCalendars(cal);
  const calendarIds = calendars.map((c) => c.id);
  const calMetaById = new Map(calendars.map((c) => [c.id, c] as const));
  const now = new Date();
  const forceSync = Boolean(opts?.forceSync);
  const minIntervalMs = opts?.minIntervalMs ?? 5 * 60 * 1000;

  // 差分同期: カレンダー単位で「前回同期時刻」以降に更新されたイベントのみ取得
  const states = await prisma.googleCalendarSyncState.findMany({
    where: { userId, calendarId: { in: calendarIds } },
    select: { calendarId: true, lastSyncAt: true },
  });
  const lastSyncById = new Map(states.map((s) => [s.calendarId, s.lastSyncAt ?? null]));

  for (const calendarId of calendarIds) {
    const meta = calMetaById.get(calendarId) ?? { id: calendarId, name: calendarId, colorId: "" };
    const lastSyncAt = lastSyncById.get(calendarId) ?? null;
    if (!forceSync && lastSyncAt && now.getTime() - lastSyncAt.getTime() < minIntervalMs) {
      continue;
    }

    const updatedMin = lastSyncById.get(calendarId) ?? null;
    let pageToken: string | undefined;

    try {
      for (let i = 0; i < 50; i++) {
        const res = await cal.events.list({
          calendarId,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
          showDeleted: true,
          ...(updatedMin ? { updatedMin: updatedMin.toISOString() } : {}),
          pageToken,
        });

        for (const ev of res.data.items ?? []) {
          if (!ev.id) continue;
          const brief = toBrief(ev, { calendarId, calendarName: meta.name, calendarColorId: meta.colorId });
          const startIso = brief.start;
          const endIso = brief.end || brief.start;
          if (!startIso) continue;

          const isCancelled = ev.status === "cancelled";
          const updatedAtGcal = ev.updated ? new Date(ev.updated) : null;
          const calendarName = meta.name;
          const calendarColorId = meta.colorId || "";
          const eventColorId = ev.colorId ?? "";

          await prisma.googleCalendarEventCache.upsert({
            where: { userId_calendarId_eventId: { userId, calendarId, eventId: ev.id } },
            create: {
              userId,
              calendarId,
              eventId: ev.id,
              calendarName,
              calendarColorId: calendarColorId || undefined,
              eventColorId: eventColorId || undefined,
              title: brief.title,
              location: brief.location,
              description: brief.description,
              startIso,
              endIso,
              startAt: dateFromIsoLikeTokyo(startIso, false),
              endAt: dateFromIsoLikeTokyo(endIso, true),
              isCancelled,
              updatedAtGcal: updatedAtGcal ?? undefined,
            },
            update: {
              calendarName,
              calendarColorId: calendarColorId || undefined,
              eventColorId: eventColorId || undefined,
              title: brief.title,
              location: brief.location,
              description: brief.description,
              startIso,
              endIso,
              startAt: dateFromIsoLikeTokyo(startIso, false),
              endAt: dateFromIsoLikeTokyo(endIso, true),
              isCancelled,
              updatedAtGcal: updatedAtGcal ?? undefined,
            },
          });
        }

        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }

      await prisma.googleCalendarSyncState.upsert({
        where: { userId_calendarId: { userId, calendarId } },
        create: { userId, calendarId, lastSyncAt: now },
        update: { lastSyncAt: now },
      });
    } catch {
      // 1つのカレンダーが落ちても全体は落とさない（購読カレンダー等での一時エラー対策）
      continue;
    }
  }
}

/** 設定画面表示用（DB のみ） */
export async function getCalendarConnectionSummary(userId: string): Promise<{
  hasGoogleAccount: boolean;
  hasRefreshToken: boolean;
  hasCalendarReadonlyScope: boolean;
  scopes: string[];
}> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true, scope: true },
  });
  const scopes = account?.scope?.split(/\s+/).filter(Boolean) ?? [];
  return {
    hasGoogleAccount: Boolean(account),
    hasRefreshToken: Boolean(account?.refresh_token),
    hasCalendarReadonlyScope: scopes.includes(CALENDAR_SCOPE),
    scopes,
  };
}

/** 未来30日の予定（タイトル・開始/終了・場所・説明） */
export async function fetchCalendarEventsForUser(
  userId: string,
  opts?: {
    forceSync?: boolean;
    fromYmd?: string;
    toYmd?: string;
    limit?: number;
  },
): Promise<CalendarFetchResult> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    return { ok: false, reason: "no_google_account" };
  }

  if (!account.refresh_token) {
    return {
      ok: false,
      reason: "no_refresh_token",
      detail:
        "Google がリフレッシュトークンを発行していません。設定の「Google を再連携（カレンダー）」から再ログインしてください。",
    };
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, reason: "oauth_not_configured" };
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: account.refresh_token });

  try {
    await oauth2.getAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/invalid_grant|Invalid grant/i.test(msg)) {
      return {
        ok: false,
        reason: "invalid_grant",
        detail: "トークンが無効です。設定から Google を再連携してください。",
      };
    }
    return { ok: false, reason: "unknown", detail: msg };
  }

  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    // 初回: 全取得（過去90日〜未来365日）→DBキャッシュ
    // 次回以降: updatedMin（前回同期時刻）で差分のみ取得
    await syncGoogleCalendarCache(userId, cal, { forceSync: opts?.forceSync, minIntervalMs: 5 * 60 * 1000 });

    const base = computeRange();
    const timeMin =
      typeof opts?.fromYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.fromYmd) ? tokyoStartOfDay(opts.fromYmd) : base.timeMin;
    const timeMax =
      typeof opts?.toYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.toYmd) ? tokyoEndOfDay(opts.toYmd) : base.timeMax;
    const limit = Math.min(Math.max(opts?.limit ?? 2000, 1), 5000);

    const rows = await prisma.googleCalendarEventCache.findMany({
      where: {
        userId,
        isCancelled: false,
        startAt: { gte: timeMin, lte: timeMax },
      },
      orderBy: { startAt: "asc" },
      take: limit,
      select: {
        calendarId: true,
        calendarName: true,
        calendarColorId: true,
        eventColorId: true,
        title: true,
        startIso: true,
        endIso: true,
        location: true,
        description: true,
      },
    });

    const events: CalendarEventBrief[] = rows
      .map((r) => ({
        calendarId: r.calendarId,
        calendarName: r.calendarName ?? r.calendarId,
        colorId: r.eventColorId ?? r.calendarColorId ?? "",
        title: r.title,
        start: r.startIso,
        end: r.endIso,
        location: r.location,
        description: r.description,
      }))
      .filter((e) => e.start)
      .sort((a, b) => sortKeyIso(a.start) - sortKeyIso(b.start));

    return { ok: true, events };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? Number((e as { code?: number }).code)
        : undefined;
    if (code === 403 || /accessNotConfigured|Calendar API has not been used/i.test(msg)) {
      return {
        ok: false,
        reason: "calendar_api_error",
        detail:
          "Google Cloud で Calendar API が有効になっていない可能性があります。コンソールで API を有効化してください。",
      };
    }
    if (code === 401 || /Invalid Credentials|invalid authentication/i.test(msg)) {
      return {
        ok: false,
        reason: "invalid_grant",
        detail: "認証に失敗しました。Google を再連携してください。",
      };
    }
    return { ok: false, reason: "calendar_api_error", detail: msg };
  }
}

/** 指定日（Asia/Tokyo の暦日 YYYY-MM-DD）に重なる予定 */
export async function fetchCalendarEventsForDay(
  userId: string,
  dayYmd: string,
): Promise<CalendarFetchResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) {
    return { ok: false, reason: "unknown", detail: "日付形式が不正です" };
  }

  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    return { ok: false, reason: "no_google_account" };
  }

  if (!account.refresh_token) {
    return {
      ok: false,
      reason: "no_refresh_token",
      detail:
        "Google がリフレッシュトークンを発行していません。設定の「Google を再連携（カレンダー）」から再ログインしてください。",
    };
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, reason: "oauth_not_configured" };
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: account.refresh_token });

  try {
    await oauth2.getAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/invalid_grant|Invalid grant/i.test(msg)) {
      return {
        ok: false,
        reason: "invalid_grant",
        detail: "トークンが無効です。設定から Google を再連携してください。",
      };
    }
    return { ok: false, reason: "unknown", detail: msg };
  }

  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    // 当日分もキャッシュ同期対象に含まれるよう、まず同期（差分）
    await syncGoogleCalendarCache(userId, cal, { forceSync: false, minIntervalMs: 5 * 60 * 1000 });

    const dayStart = tokyoStartOfDay(dayYmd);
    const dayEnd = tokyoEndOfDay(dayYmd);

    // 「当日に重なる」: startAt <= dayEnd && endAt >= dayStart
    const rows = await prisma.googleCalendarEventCache.findMany({
      where: {
        userId,
        isCancelled: false,
        startAt: { lte: dayEnd },
        endAt: { gte: dayStart },
      },
      orderBy: { startAt: "asc" },
      take: 50,
      select: {
        calendarId: true,
        calendarName: true,
        calendarColorId: true,
        eventColorId: true,
        title: true,
        startIso: true,
        endIso: true,
        location: true,
        description: true,
      },
    });

    const events: CalendarEventBrief[] = rows
      .map((r) => ({
        calendarId: r.calendarId,
        calendarName: r.calendarName ?? r.calendarId,
        colorId: r.eventColorId ?? r.calendarColorId ?? "",
        title: r.title,
        start: r.startIso,
        end: r.endIso,
        location: r.location,
        description: r.description,
      }))
      .filter((e) => e.start)
      .sort((a, b) => sortKeyIso(a.start) - sortKeyIso(b.start));

    return { ok: true, events };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? Number((e as { code?: number }).code)
        : undefined;
    if (code === 403 || /accessNotConfigured|Calendar API has not been used/i.test(msg)) {
      return {
        ok: false,
        reason: "calendar_api_error",
        detail:
          "Google Cloud で Calendar API が有効になっていない可能性があります。コンソールで API を有効化してください。",
      };
    }
    if (code === 401 || /Invalid Credentials|invalid authentication/i.test(msg)) {
      return {
        ok: false,
        reason: "invalid_grant",
        detail: "認証に失敗しました。Google を再連携してください。",
      };
    }
    return { ok: false, reason: "calendar_api_error", detail: msg };
  }
}
