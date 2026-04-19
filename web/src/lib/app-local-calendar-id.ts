/** Google の calendarId と衝突しないよう、アプリ内カレンダーはこの接頭辞付きで扱う */
export const APP_LOCAL_CALENDAR_PREFIX = "app:" as const;

export function isAppLocalCalendarId(calendarId: string): boolean {
  return (calendarId ?? "").trim().startsWith(APP_LOCAL_CALENDAR_PREFIX);
}

/** DB の app_local_calendars.id（接頭辞なし）へ */
export function stripAppLocalCalendarIdToken(token: string): string {
  const t = (token ?? "").trim();
  if (!t.startsWith(APP_LOCAL_CALENDAR_PREFIX)) return t;
  return t.slice(APP_LOCAL_CALENDAR_PREFIX.length);
}

/** API / UI 用のトークン */
export function toAppLocalCalendarIdToken(localCalendarRowId: string): string {
  const id = (localCalendarRowId ?? "").trim();
  if (!id) return "";
  return id.startsWith(APP_LOCAL_CALENDAR_PREFIX) ? id : `${APP_LOCAL_CALENDAR_PREFIX}${id}`;
}

/** 一覧・セレクトの表示用（例: メモ(アプリ)） */
export function formatAppLocalCalendarDisplayName(name: string): string {
  const n = (name ?? "").trim();
  return n ? `${n}(アプリ)` : "(アプリ)";
}
