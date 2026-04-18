import type { CalendarOpeningCategory, CalendarOpeningSettings } from "@/lib/user-settings";
import {
  addCalendarOpeningBuiltinTextHints,
  BIRTHDAY_CALENDAR_NAME_SCORE_BOOST,
  normalizeCalendarOpeningPriorityOrder,
  pickWinningCalendarCategory,
  PARTTIME_CALENDAR_NAME_SCORE_BOOST,
  SCHOOL_CALENDAR_NAME_SCORE_BOOST,
  suggestsBirthdayCalendarName,
  suggestsParttimeCalendarName,
  suggestsSchoolCalendarName,
} from "@/lib/user-settings";

/** Shift-like calendar name: one-shot parttime bonus scaled by sqrt(event count), capped. */
export const SHIFT_CALENDAR_NAME_TOTAL_BONUS_COEFF = 4.5;
export const SHIFT_CALENDAR_NAME_TOTAL_BONUS_MAX = 95;

/** Birthday-themed calendar name: aggregate bonus toward `birthday`. */
export const BIRTHDAY_CALENDAR_NAME_TOTAL_BONUS_COEFF = 3.2;
export const BIRTHDAY_CALENDAR_NAME_TOTAL_BONUS_MAX = 72;

/** School-themed calendar name: aggregate bonus toward `school`. */
export const SCHOOL_CALENDAR_NAME_TOTAL_BONUS_COEFF = 3.8;
export const SCHOOL_CALENDAR_NAME_TOTAL_BONUS_MAX = 78;

export type AutoClassifyEvent = {
  title?: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  calendarId?: string;
  calendarName?: string;
  colorId?: string;
};

export function eventDurationMinutes(start: string, end: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const a = Date.parse(`${start}T00:00:00+09:00`);
    const b = Date.parse(`${end}T23:59:59+09:00`);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    return (b - a) / 60000;
  }
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / 60000;
}

function addDurationHints(
  minutes: number | null,
  add: (c: CalendarOpeningCategory, w: number) => void,
  ctx?: { hayLower: string; calendarName?: string | null },
): void {
  if (minutes == null) return;
  // All-day Google events span ~24h; on academic calendars prefer school (no builtin hobby keyword boosts).
  if (minutes >= 22 * 60 && minutes <= 36 * 60) {
    const hay = ctx?.hayLower ?? "";
    const academic =
      /[\u8ab2\u984c\u63d0\u51fa\u30ec\u30dd\u30fc\u30c8\u8a66\u9a13\u7de0\u5207\u6388\u696d\u30bc\u30df\u5358\u4f4d]/.test(hay) ||
      /\b(deadline|assignment|homework|exam)\b/i.test(hay);
    const calSchool = ctx?.calendarName && suggestsSchoolCalendarName(ctx.calendarName);
    if (academic || calSchool) {
      add("school", 5);
    }
    return;
  }
  if (minutes >= 20 * 60) return;
  if (minutes >= 420 && minutes <= 780) add("parttime", 6);
  else if (minutes >= 240 && minutes < 420) add("parttime", 5);
  else if (minutes >= 75 && minutes < 240) add("parttime", 4);
  if (minutes >= 40 && minutes <= 105) add("school", 2);
}

function applyRules(
  ev: AutoClassifyEvent,
  rules: CalendarOpeningSettings["rules"],
  add: (cat: CalendarOpeningCategory, w: number) => void,
): void {
  const hayTitle = (ev.title ?? "").toLowerCase();
  const hayLoc = (ev.location ?? "").toLowerCase();
  const hayDesc = (ev.description ?? "").toLowerCase();
  for (const r of rules ?? []) {
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
}

function buildBaseScores(ev: AutoClassifyEvent, settings: CalendarOpeningSettings | null): Map<CalendarOpeningCategory, number> {
  const scores = new Map<CalendarOpeningCategory, number>();
  const add = (cat: CalendarOpeningCategory, w: number) => {
    scores.set(cat, (scores.get(cat) ?? 0) + w);
  };
  applyRules(ev, settings?.rules, add);
  const haystack = `${ev.title ?? ""}\n${ev.location ?? ""}\n${ev.description ?? ""}\n${ev.calendarName ?? ""}`;
  addCalendarOpeningBuiltinTextHints(haystack, add);
  if (suggestsParttimeCalendarName(ev.calendarName)) add("parttime", PARTTIME_CALENDAR_NAME_SCORE_BOOST);
  if (suggestsBirthdayCalendarName(ev.calendarName)) add("birthday", BIRTHDAY_CALENDAR_NAME_SCORE_BOOST);
  if (suggestsSchoolCalendarName(ev.calendarName)) add("school", SCHOOL_CALENDAR_NAME_SCORE_BOOST);
  addDurationHints(eventDurationMinutes(ev.start, ev.end), add, {
    hayLower: haystack.toLowerCase(),
    calendarName: ev.calendarName,
  });
  add("other", 1);
  return scores;
}

export function scoreEventForAutoClassification(
  ev: AutoClassifyEvent,
  settings: CalendarOpeningSettings | null,
): Map<CalendarOpeningCategory, number> {
  return buildBaseScores(ev, settings);
}

export function aggregateCalendarAutoClassification(
  events: AutoClassifyEvent[],
  calendarNameForTotals: string | null | undefined,
  settings: CalendarOpeningSettings | null,
): {
  totals: Map<CalendarOpeningCategory, number>;
  avgDurationMinutes: number | null;
  priority: CalendarOpeningCategory[];
} {
  const totals = new Map<CalendarOpeningCategory, number>();
  let durSum = 0;
  let durCount = 0;
  for (const ev of events) {
    const m = scoreEventForAutoClassification(ev, settings);
    for (const [c, v] of m) {
      totals.set(c, (totals.get(c) ?? 0) + v);
    }
    const dm = eventDurationMinutes(ev.start, ev.end);
    if (dm != null && dm < 20 * 60) {
      durSum += dm;
      durCount++;
    }
  }
  const n = events.length;
  if (suggestsParttimeCalendarName(calendarNameForTotals) && n > 0) {
    const bump = Math.min(
      SHIFT_CALENDAR_NAME_TOTAL_BONUS_MAX,
      SHIFT_CALENDAR_NAME_TOTAL_BONUS_COEFF * Math.sqrt(n),
    );
    totals.set("parttime", (totals.get("parttime") ?? 0) + bump);
  }
  if (suggestsBirthdayCalendarName(calendarNameForTotals) && n > 0) {
    const bump = Math.min(
      BIRTHDAY_CALENDAR_NAME_TOTAL_BONUS_MAX,
      BIRTHDAY_CALENDAR_NAME_TOTAL_BONUS_COEFF * Math.sqrt(n),
    );
    totals.set("birthday", (totals.get("birthday") ?? 0) + bump);
  }
  if (suggestsSchoolCalendarName(calendarNameForTotals) && n > 0) {
    const bump = Math.min(
      SCHOOL_CALENDAR_NAME_TOTAL_BONUS_MAX,
      SCHOOL_CALENDAR_NAME_TOTAL_BONUS_COEFF * Math.sqrt(n),
    );
    totals.set("school", (totals.get("school") ?? 0) + bump);
  }
  const priority = normalizeCalendarOpeningPriorityOrder(settings);
  const avgDurationMinutes = durCount > 0 ? durSum / durCount : null;
  return { totals, avgDurationMinutes, priority };
}

export function pickTopTwoFromTotals(
  totals: Map<CalendarOpeningCategory, number>,
  priority: CalendarOpeningCategory[],
): {
  winner: CalendarOpeningCategory;
  top: number;
  secondCat: CalendarOpeningCategory | null;
  second: number;
} {
  const winner = pickWinningCalendarCategory(totals, priority);
  const top = totals.get(winner) ?? 0;
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const secondEntry = ranked.find(([c]) => c !== winner) ?? null;
  return { winner, top, secondCat: secondEntry?.[0] ?? null, second: secondEntry?.[1] ?? 0 };
}

/** Heuristic: top-two scores are close enough that an LLM may help. */
export function shouldRefineWithLlm(top: number, second: number): boolean {
  if (top <= 0) return false;
  if (second <= 0) return false;
  return (top - second) / top < 0.16;
}
