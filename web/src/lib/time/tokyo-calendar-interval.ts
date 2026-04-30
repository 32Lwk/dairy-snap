import { nextCalendarYmdInZone } from "@/lib/time/user-day-boundary";

const TOKYO = "Asia/Tokyo";

/** 東京暦日 `YYYY-MM-DD` の開始（0 時）。Google 終日の開始日・排他的終了日の解釈と揃える。 */
export function tokyoCalendarDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

/** 翌東京暦日の 0 時 = `ymd` 日の半開区間 [start, endExclusive) の end */
export function tokyoCalendarDayEndExclusive(ymd: string): Date {
  return tokyoCalendarDayStart(nextCalendarYmdInZone(ymd, TOKYO));
}

/**
 * 東京暦日 1 日分（半開区間）とイベント区間が重なるか。
 * イベントも半開 [startAt, endAt) とみなす（終日キャッシュの endAt は排他的終端の 0 時）。
 */
export function tokyoCalendarDayOverlapsCachedEvent(
  rangeDayYmd: string,
  eventStart: Date,
  eventEnd: Date,
): boolean {
  const ds = tokyoCalendarDayStart(rangeDayYmd);
  const de = tokyoCalendarDayEndExclusive(rangeDayYmd);
  return eventStart < de && eventEnd > ds;
}
