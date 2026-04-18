const TOKYO = "Asia/Tokyo";

/** 東京日付を YYYY-MM-DD で返す */
export function formatYmdTokyo(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 東京時刻を HH:mm（24h）で返す */
export function formatHmTokyo(date: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return s;
}

/** True if `s` is a real calendar day in Asia/Tokyo (YYYY-MM-DD). */
export function isValidYmdTokyo(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = new Date(`${s}T12:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return false;
  return formatYmdTokyo(dt) === s;
}
