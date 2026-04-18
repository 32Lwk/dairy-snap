export const CALENDAR_VIEW_STORAGE_KEY = "daily-snap-calendar-view";

export type CalendarViewMode = "grid" | "list";

export function parseCalendarViewQuery(v: string | null): CalendarViewMode | null {
  if (v === "grid" || v === "list") return v;
  return null;
}

export function readCalendarViewFromStorage(): CalendarViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    if (v === "grid" || v === "list") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeCalendarViewToStorage(mode: CalendarViewMode): void {
  try {
    window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
