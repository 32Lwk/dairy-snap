/** 月グリッドのドット色プリセット（Google 公式 colorId の近似色を中心） */
export const CALENDAR_GRID_COLOR_PRESETS: readonly string[] = [
  "#a4bdfc",
  "#7ae7bf",
  "#dbadff",
  "#ff887c",
  "#fbd75b",
  "#ffb878",
  "#46d6db",
  "#e1e1e1",
  "#5484ed",
  "#51b749",
  "#dc2127",
  "#10b981",
];

/** Google Calendar API の colorId → 表示用（近似） */
export const GCAL_COLOR_MAP: Record<string, string> = {
  "1": "#a4bdfc",
  "2": "#7ae7bf",
  "3": "#dbadff",
  "4": "#ff887c",
  "5": "#fbd75b",
  "6": "#ffb878",
  "7": "#46d6db",
  "8": "#e1e1e1",
  "9": "#5484ed",
  "10": "#51b749",
  "11": "#dc2127",
};

const FALLBACK = "#10b981";

export function resolveGcalEventColor(
  ev: { colorId?: string; calendarId?: string },
  calendarHexById: Record<string, string>,
): string {
  const cid = ev.calendarId;
  if (cid && calendarHexById[cid]) return calendarHexById[cid];
  return GCAL_COLOR_MAP[ev.colorId ?? ""] ?? FALLBACK;
}
