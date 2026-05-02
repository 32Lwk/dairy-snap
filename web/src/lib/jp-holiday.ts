import JapaneseHolidays from "japanese-holidays";
import {
  calendarTitleClaimsWrongCatalogNationalHolidayWithTodayOverride,
  getOfficialNationalHolidayNameJa,
} from "@/lib/jp-national-holidays-official";
import { nationalHolidayTitleMatches } from "@/lib/jp-holiday-title-match";
import { previousCalendarYmdInZone } from "@/lib/time/user-day-boundary";

function dateAtNoonJst(ymd: string): Date | null {
  const t = (ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T12:00:00+09:00`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function getJapaneseHolidayNameFromLib(ymd: string): string | null {
  const d = dateAtNoonJst(ymd);
  if (!d) return null;
  const name = JapaneseHolidays.isHolidayAt(d);
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * 日本の祝日名（表示・判定用）。
 * 1) 内閣府 syukujitsu.csv 由来のバンドル JSON（正）
 * 2) japanese-holidays（JSON に無い極端な日付のフォールバック）
 */
export function getJapaneseHolidayNameJa(ymd: string): string | null {
  return getOfficialNationalHolidayNameJa(ymd) ?? getJapaneseHolidayNameFromLib(ymd);
}

export { nationalHolidayTitleMatches } from "@/lib/jp-holiday-title-match";

/**
 * 開口・オーケストレータ用。
 * - 当日の公式祝日ラベルを最優先
 * - カレンダー終日タイトルは「名称カタログと日付の整合」が取れない国民祝日名を **採用しない**
 * - 前日の祝日名が翌日に重なるゴーストは採用しない
 */
export function resolveJapaneseHolidayNameForEntry(
  entryDateYmd: string,
  calendarAllDayHolidayTitle: string | null | undefined,
): string | null {
  const officialToday = getOfficialNationalHolidayNameJa(entryDateYmd);
  if (officialToday) return officialToday;
  const libToday = getJapaneseHolidayNameFromLib(entryDateYmd);
  if (libToday) return libToday;

  const cal = (calendarAllDayHolidayTitle ?? "").trim();
  if (!cal) return null;
  if (calendarTitleClaimsWrongCatalogNationalHolidayWithTodayOverride(entryDateYmd, cal, libToday)) return null;

  const prevYmd = previousCalendarYmdInZone(entryDateYmd, "Asia/Tokyo");
  const officialPrev = getOfficialNationalHolidayNameJa(prevYmd);
  if (officialPrev && nationalHolidayTitleMatches(cal, officialPrev)) return null;
  const libPrev = getJapaneseHolidayNameFromLib(prevYmd);
  if (libPrev && nationalHolidayTitleMatches(cal, libPrev)) return null;

  return cal;
}

export function isAllDayStyleCalendarStart(start: string): boolean {
  const s = (start ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  return /^\d{4}-\d{2}-\d{2}T00:00:00/.test(s);
}

export function looksLikeHolidayCalendarIdOrName(ev: { calendarId?: string; calendarName?: string }): boolean {
  const id = (ev.calendarId ?? "").toLowerCase();
  const name = (ev.calendarName ?? "").toLowerCase();
  if (id.includes("#holiday@")) return true;
  if (id.includes("holiday") && id.includes("@group.v.calendar.google.com")) return true;
  if (name.includes("祝日") || name.includes("holiday")) return true;
  if (name.includes("日本の祝日") || name.includes("祝日カレンダー")) return true;
  return false;
}

/** 終日タイトルが休日・祝日ラベルっぽいか（カレンダー名が無いソース向け） */
export function looksLikeHolidayTitle(titleRaw: string): boolean {
  const t = (titleRaw ?? "").trim();
  if (!t) return false;
  if (t.includes("祝日")) return true;
  if (t.includes("休日")) return true;
  if (t.includes("振替休日")) return true;
  if (t.includes("代休")) return true;
  if (t === "休み" || t === "お休み") return true;
  if (/^(休み|お休み)(（|$)/.test(t)) return true;
  return false;
}

/**
 * 薄い日・祝日雑学用: 「実質的な予定」ではない終日イベント（祝日カレンダー・休日風タイトル・当日の公式祝日名と一致する終日など）。
 * Google の終日は `YYYY-MM-DD` または `T00:00:00` 始まりで来ることがある。
 */
export function isDecorativeNationalHolidayLikeCalendarEvent<
  T extends { title?: string; start?: string; calendarId?: string; calendarName?: string },
>(ev: T, entryHolidayNameJa: string | null): boolean {
  if (!isAllDayStyleCalendarStart((ev.start ?? "").trim())) return false;
  const title = (ev.title ?? "").trim();
  if (!title) return false;
  if (looksLikeHolidayCalendarIdOrName(ev)) return true;
  if (looksLikeHolidayTitle(title)) return true;
  const h = (entryHolidayNameJa ?? "").trim();
  if (h && nationalHolidayTitleMatches(title, h)) return true;
  return false;
}

/** 開口の「予定件数」相当: 装飾的な祝日終日を除いた件数（0 なら実質カレンダー空に近い） */
export function countSubstantiveCalendarPlanEvents<
  T extends { title?: string; start?: string; calendarId?: string; calendarName?: string },
>(events: T[], entryHolidayNameJa: string | null): number {
  return events.filter((ev) => !isDecorativeNationalHolidayLikeCalendarEvent(ev, entryHolidayNameJa)).length;
}

/**
 * Google カレンダー等で「前日の祝日」終日イベントが翌暦日のクエリに重なることがある。
 * 当日が **公式上も祝日でない** のに、タイトルが **前日の祝日名** と一致する終日系イベントは除外。
 */
export function filterOutPreviousDayNationalHolidayGhosts<T extends { title?: string; start?: string }>(
  entryDateYmd: string,
  events: T[],
): T[] {
  if (!events.length) return events;
  if (getOfficialNationalHolidayNameJa(entryDateYmd) || getJapaneseHolidayNameFromLib(entryDateYmd)) {
    return events;
  }
  const prevYmd = previousCalendarYmdInZone(entryDateYmd, "Asia/Tokyo");
  const prevName = getOfficialNationalHolidayNameJa(prevYmd) ?? getJapaneseHolidayNameFromLib(prevYmd);
  if (!prevName) return events;

  return events.filter((ev) => {
    const start = (ev.start ?? "").trim();
    if (!isAllDayStyleCalendarStart(start)) return true;
    const title = (ev.title ?? "").trim();
    if (!title) return true;
    // Holiday ghosts overwhelmingly come from subscribed holiday calendars; avoid stripping user-made events.
    if (!looksLikeHolidayCalendarIdOrName(ev as unknown as { calendarId?: string; calendarName?: string })) return true;
    if (!nationalHolidayTitleMatches(title, prevName)) return true;
    return false;
  });
}

/**
 * 終日予定タイトルが **内閣府カタログ上の祝日名** に見えるが **当日の公式ラベルと一致しない**
 * → AI に渡さない（誤同期・サブスクのゴースト対策）。
 */
export function filterOutMisdatedNationalHolidayCalendarEvents<T extends { title?: string; start?: string }>(
  entryDateYmd: string,
  events: T[],
): T[] {
  if (!events.length) return events;
  const todayAlt = getJapaneseHolidayNameFromLib(entryDateYmd);
  return events.filter((ev) => {
    const start = (ev.start ?? "").trim();
    if (!isAllDayStyleCalendarStart(start)) return true;
    const title = (ev.title ?? "").trim();
    if (!title) return true;
    // Restrict removal to holiday-calendar sources to preserve user-authored events titled like holidays.
    if (!looksLikeHolidayCalendarIdOrName(ev as unknown as { calendarId?: string; calendarName?: string })) return true;
    if (calendarTitleClaimsWrongCatalogNationalHolidayWithTodayOverride(entryDateYmd, title, todayAlt)) return false;
    return true;
  });
}

/** 開口用: 祝日ゴースト除去を順に適用 */
export function filterCalendarEventsForAiNationalHolidaySanity<T extends { title?: string; start?: string }>(
  entryDateYmd: string,
  events: T[],
): T[] {
  return filterOutMisdatedNationalHolidayCalendarEvents(
    entryDateYmd,
    filterOutPreviousDayNationalHolidayGhosts(entryDateYmd, events),
  );
}
