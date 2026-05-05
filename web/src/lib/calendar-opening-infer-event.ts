import type { CalendarOpeningCategory, CalendarOpeningSettings } from "@/lib/user-settings";
import { looksLikeDiningVenueReservation } from "@/lib/calendar-dining-reservation";
import {
  addCalendarOpeningBuiltinTextHints,
  BIRTHDAY_CALENDAR_NAME_SCORE_BOOST,
  CALENDAR_DEFAULT_CATEGORY_WEIGHT,
  normalizeCalendarOpeningPriorityOrder,
  PARTTIME_CALENDAR_NAME_SCORE_BOOST,
  pickWinningCalendarCategory,
  resolveCalendarDefaultCategoriesForScoring,
  SCHOOL_CALENDAR_NAME_SCORE_BOOST,
  shouldApplyCalendarNameBoostForCategory,
  suggestsBirthdayCalendarName,
  suggestsParttimeCalendarName,
  suggestsSchoolCalendarName,
} from "@/lib/user-settings";

/** 開口・カレンダー要約・勤務エージェントで共有する最小イベント形 */
export type CalendarEventForCategoryInfer = {
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  eventSearchBlob?: string;
  calendarName?: string;
  calendarId?: string;
  colorId?: string;
  fixedCategory?: string;
};

/**
 * カレンダー UI と同じルールで 1 イベントの開口カテゴリを決定する。
 * （クライアント `inferCategoryForEvent` と同等）
 */
export function inferCalendarEventCategory(
  ev: CalendarEventForCategoryInfer,
  settings: CalendarOpeningSettings | null,
): CalendarOpeningCategory {
  const fixed = (ev.fixedCategory ?? "").trim();
  if (fixed) return fixed as CalendarOpeningCategory;
  const rules = settings?.rules ?? [];
  const priority = normalizeCalendarOpeningPriorityOrder(settings);
  const hayTitle = (ev.title ?? "").toLowerCase();
  const hayLoc = (ev.location ?? "").toLowerCase();
  const hayDesc = (ev.description ?? "").toLowerCase();
  const haystack = [
    ev.title ?? "",
    ev.location ?? "",
    ev.description ?? "",
    ev.eventSearchBlob ?? "",
    ev.calendarName ?? "",
  ].join("\n");
  const scores = new Map<CalendarOpeningCategory, number>();
  const add = (cat: CalendarOpeningCategory, w: number) => {
    scores.set(cat, (scores.get(cat) ?? 0) + w);
  };
  const calDefaults = resolveCalendarDefaultCategoriesForScoring(
    ev.calendarId,
    ev.calendarName,
    settings?.calendarCategoryById,
  );
  for (const calDefault of calDefaults) add(calDefault, CALENDAR_DEFAULT_CATEGORY_WEIGHT);
  for (const r of rules) {
    const w = typeof r.weight === "number" ? r.weight : 5;
    const v = (r.value ?? "").toLowerCase();
    if (!v) continue;
    if (r.kind === "calendarId") {
      if (ev.calendarId && ev.calendarId === r.value) add(r.category, w);
      continue;
    }
    if (r.kind === "colorId") {
      if (ev.colorId && ev.colorId === r.value) add(r.category, w);
      continue;
    }
    if (r.kind === "keyword") {
      if (hayTitle.includes(v)) add(r.category, w);
      continue;
    }
    if (r.kind === "location") {
      if (hayLoc.includes(v)) add(r.category, w);
      continue;
    }
    if (r.kind === "description") {
      if (hayDesc.includes(v)) add(r.category, w);
      continue;
    }
  }
  addCalendarOpeningBuiltinTextHints(haystack, add);
  if (shouldApplyCalendarNameBoostForCategory("parttime", calDefaults) && suggestsParttimeCalendarName(ev.calendarName)) {
    add("parttime", PARTTIME_CALENDAR_NAME_SCORE_BOOST);
  }
  if (shouldApplyCalendarNameBoostForCategory("birthday", calDefaults) && suggestsBirthdayCalendarName(ev.calendarName)) {
    add("birthday", BIRTHDAY_CALENDAR_NAME_SCORE_BOOST);
  }
  if (shouldApplyCalendarNameBoostForCategory("school", calDefaults) && suggestsSchoolCalendarName(ev.calendarName)) {
    add("school", SCHOOL_CALENDAR_NAME_SCORE_BOOST);
  }
  add("other", 1);
  let best = pickWinningCalendarCategory(scores, priority);
  // Bar/restaurant reservations are often mis-tagged as 就活 due to calendar defaults or "opaque title" heuristics.
  if (looksLikeDiningVenueReservation(ev) && best === "job_hunt") {
    best = "family";
  }
  return best;
}
