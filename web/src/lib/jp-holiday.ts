import JapaneseHolidays from "japanese-holidays";

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

