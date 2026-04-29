/**
 * User-local "day" with optional late-night window (00:00–boundary → still previous calendar day).
 */

export const DEFAULT_DAY_BOUNDARY_END_TIME = "00:00";
// UX要件: 早朝（〜06:00）でも「まだ昨日の続き」として振り返れる余地を残す
export const MAX_DAY_BOUNDARY_END_TIME = "06:00";

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/** IANA TZ validation via Intl (throws if invalid). */
export function isValidIanaTimeZone(timeZone: string): boolean {
  const t = timeZone.trim();
  if (!t || t.length > 120) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatHmInTimeZone(date: Date, timeZone: string): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return s;
}

/** First instant (ms) where `formatYmdInTimeZone` is `ymd` in `timeZone`. */
export function startOfCalendarDayInZoneUtcMs(ymd: string, timeZone: string): number {
  const parts = ymd.split("-").map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (y == null || mo == null || d == null) return Number.NaN;
  let lo = Date.UTC(y, mo - 1, d - 1, 0, 0, 0);
  let hi = Date.UTC(y, mo - 1, d + 1, 0, 0, 0);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const midYmd = formatYmdInTimeZone(new Date(mid), timeZone);
    if (midYmd < ymd) lo = mid;
    else hi = mid;
  }
  let t = hi;
  while (t > lo && formatYmdInTimeZone(new Date(t - 1), timeZone) === ymd) {
    t -= 1;
  }
  return t;
}

export function previousCalendarYmdInZone(ymd: string, timeZone: string): string {
  const ms = startOfCalendarDayInZoneUtcMs(ymd, timeZone);
  if (!Number.isFinite(ms)) return ymd;
  return formatYmdInTimeZone(new Date(ms - 1), timeZone);
}

/** Next calendar day (YYYY-MM-DD) after `ymd` in `timeZone`. */
export function nextCalendarYmdInZone(ymd: string, timeZone: string): string {
  const start = startOfCalendarDayInZoneUtcMs(ymd, timeZone);
  if (!Number.isFinite(start)) return ymd;
  let t = start + 12 * 3_600_000;
  for (let i = 0; i < 96; i++) {
    const y = formatYmdInTimeZone(new Date(t), timeZone);
    if (y !== ymd) return y;
    t += 3_600_000;
  }
  return formatYmdInTimeZone(new Date(start + 36 * 3_600_000), timeZone);
}

/** Calendar-day delta in `timeZone`: `toYmd` minus `fromYmd`. */
export function diffCalendarDaysInZone(fromYmd: string, toYmd: string, timeZone: string): number {
  const a = startOfCalendarDayInZoneUtcMs(fromYmd, timeZone);
  const b = startOfCalendarDayInZoneUtcMs(toYmd, timeZone);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Resolved boundary HH:mm (default 00:00). Stored null → default; clamps above max to max.
 */
export function resolveDayBoundaryEndTime(stored: string | null | undefined): string {
  const raw = (stored ?? "").trim();
  const s = raw || DEFAULT_DAY_BOUNDARY_END_TIME;
  const maxM = hmToMinutes(MAX_DAY_BOUNDARY_END_TIME) ?? 3 * 60;
  const m = hmToMinutes(s);
  if (m == null) return DEFAULT_DAY_BOUNDARY_END_TIME;
  return m > maxM ? MAX_DAY_BOUNDARY_END_TIME : s;
}

export function resolveUserTimeZone(profileTz: string | undefined, dbUserTz: string | undefined): string {
  const p = profileTz?.trim();
  if (p && isValidIanaTimeZone(p)) return p;
  const d = dbUserTz?.trim();
  if (d && isValidIanaTimeZone(d)) return d;
  return "Asia/Tokyo";
}

/**
 * "App today" YMD: before local `boundary` on calendar day C, counts as previous calendar day.
 */
export function getEffectiveTodayYmd(
  now: Date,
  timeZone: string,
  dayBoundaryEndTime: string,
): string {
  const calYmd = formatYmdInTimeZone(now, timeZone);
  const hm = formatHmInTimeZone(now, timeZone);
  const nowMin = hmToMinutes(hm) ?? 0;
  const boundaryMin = hmToMinutes(dayBoundaryEndTime) ?? hmToMinutes(DEFAULT_DAY_BOUNDARY_END_TIME)!;
  if (nowMin >= 0 && nowMin < boundaryMin) {
    return previousCalendarYmdInZone(calYmd, timeZone);
  }
  return calYmd;
}

/** Calendar "today" in zone (ignoring late-night shift). */
export function getCalendarYmdInZone(now: Date, timeZone: string): string {
  return formatYmdInTimeZone(now, timeZone);
}

/**
 * Next instant when the effective "app day" rolls (local time hits boundary).
 */
export function getNextEffectiveDayResetAtIso(now: Date, timeZone: string, dayBoundaryEndTime: string): string {
  const boundary = resolveDayBoundaryEndTime(dayBoundaryEndTime);
  const calYmd = formatYmdInTimeZone(now, timeZone);
  const hm = formatHmInTimeZone(now, timeZone);
  const nowMin = hmToMinutes(hm) ?? 0;
  const bMin = hmToMinutes(boundary) ?? hmToMinutes(DEFAULT_DAY_BOUNDARY_END_TIME)!;

  const dayStart = startOfCalendarDayInZoneUtcMs(calYmd, timeZone);
  if (nowMin < bMin) {
    return new Date(dayStart + bMin * 60_000).toISOString();
  }
  const nextYmd = nextCalendarYmdInZone(calYmd, timeZone);
  const nextStart = startOfCalendarDayInZoneUtcMs(nextYmd, timeZone);
  return new Date(nextStart + bMin * 60_000).toISOString();
}
