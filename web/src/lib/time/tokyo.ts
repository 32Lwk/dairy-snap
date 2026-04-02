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
