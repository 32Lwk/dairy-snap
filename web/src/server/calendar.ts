import { google } from "googleapis";
import { prisma } from "@/server/db";

export type CalendarEventBrief = {
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
export async function fetchCalendarEventsForUser(userId: string): Promise<CalendarFetchResult> {
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
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 30);

    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events: CalendarEventBrief[] =
      res.data.items?.map((ev) => ({
        title: ev.summary ?? "",
        start: ev.start?.dateTime ?? ev.start?.date ?? "",
        end: ev.end?.dateTime ?? ev.end?.date ?? "",
        location: ev.location ?? "",
        description: (ev.description ?? "").slice(0, 500),
      })) ?? [];

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
    const timeMin = `${dayYmd}T00:00:00+09:00`;
    const timeMax = `${dayYmd}T23:59:59.999+09:00`;

    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events: CalendarEventBrief[] =
      res.data.items?.map((ev) => ({
        title: ev.summary ?? "",
        start: ev.start?.dateTime ?? ev.start?.date ?? "",
        end: ev.end?.dateTime ?? ev.end?.date ?? "",
        location: ev.location ?? "",
        description: (ev.description ?? "").slice(0, 500),
      })) ?? [];

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
