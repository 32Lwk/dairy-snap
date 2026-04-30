import JapaneseHolidays from "japanese-holidays";
import { previousCalendarYmdInZone } from "@/lib/time/user-day-boundary";

function dateAtNoonJst(ymd: string): Date | null {
  const t = (ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T12:00:00+09:00`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/**
 * Returns Japanese holiday name if the date is a public holiday.
 * - Uses "isHolidayAt" so the lookup is anchored to Japan dates.
 * - Returns null when not a holiday or when input is invalid.
 */
export function getJapaneseHolidayNameJa(ymd: string): string | null {
  const d = dateAtNoonJst(ymd);
  if (!d) return null;
  const name = JapaneseHolidays.isHolidayAt(d);
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * 開口・オーケストレータ用。国立祝日ライブラリを正とし、カレンダーの終日ラベルは補助。
 * 終日イベントの終端解釈ミスや古いキャッシュで「前日の祝日」が翌日分に残る場合、
 * タイトルが前日の祝日名と一致するだけなら当日の祝日シグナルから外す。
 */
export function resolveJapaneseHolidayNameForEntry(
  entryDateYmd: string,
  calendarAllDayHolidayTitle: string | null | undefined,
): string | null {
  const libToday = getJapaneseHolidayNameJa(entryDateYmd);
  if (libToday) return libToday;
  const cal = (calendarAllDayHolidayTitle ?? "").trim();
  if (!cal) return null;
  const prevYmd = previousCalendarYmdInZone(entryDateYmd, "Asia/Tokyo");
  const libPrev = getJapaneseHolidayNameJa(prevYmd);
  if (libPrev && cal === libPrev) return null;
  return cal;
}

