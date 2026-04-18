import { isInterestFreePick } from "@/lib/interest-taxonomy";
import type { CalendarOpeningCategory, UserProfileSettings } from "@/lib/user-settings";

/** Profile-based score deltas (additive). Avoid-topics apply negative deltas. */
const FOCUS_BOOST = 3;
const INTEREST_BOOST_PER_CATEGORY = 2;
const MAX_INTEREST_BOOST_PER_CAT = 6;
const AVOID_PENALTY = 10;
const AVOID_PENALTY_LIGHT = 5;

export type OpeningProfileSignalsInput = Pick<
  UserProfileSettings,
  "interestPicks" | "aiAvoidTopics" | "aiCurrentFocus"
>;

function bump(
  scores: Map<CalendarOpeningCategory, number>,
  cat: CalendarOpeningCategory,
  delta: number,
): void {
  scores.set(cat, (scores.get(cat) ?? 0) + delta);
}

/** Map one interest pick id to one or more opening categories. */
function calendarCategoriesForInterestPick(pickId: string): CalendarOpeningCategory[] {
  if (isInterestFreePick(pickId)) return ["hobby"];
  const top = pickId.split(":")[0] ?? "";
  if (top === "learn") return ["school"];
  if (top === "life") {
    if (pickId.startsWith("life:fitness") || pickId.startsWith("life:mental")) return ["health"];
    if (pickId.includes("parenting")) return ["family"];
    return ["hobby", "health"];
  }
  if (
    top === "music" ||
    top === "sports" ||
    top === "media" ||
    top === "games" ||
    top === "creative" ||
    top === "outdoor" ||
    top === "food" ||
    top === "tech" ||
    top === "fashion" ||
    top === "pets"
  ) {
    return ["hobby"];
  }
  return ["hobby"];
}

function applyAvoidPenalties(
  scores: Map<CalendarOpeningCategory, number>,
  avoid: string[] | undefined,
): void {
  if (!avoid?.length || avoid.includes("none")) return;
  const p = (cat: CalendarOpeningCategory, w: number) => bump(scores, cat, -w);
  for (const k of avoid) {
    switch (k) {
      case "romance":
        p("date", AVOID_PENALTY);
        break;
      case "health_medical":
        p("health", AVOID_PENALTY);
        break;
      case "appearance_diet":
        p("health", AVOID_PENALTY_LIGHT);
        break;
      case "family_detail":
        p("family", AVOID_PENALTY);
        break;
      case "work_confidential":
        p("job_hunt", AVOID_PENALTY_LIGHT);
        p("parttime", AVOID_PENALTY_LIGHT);
        break;
      case "money_detail":
        p("family", AVOID_PENALTY_LIGHT);
        break;
      case "school_bully_grade":
        p("school", AVOID_PENALTY);
        break;
      case "parenting_care_load":
        p("family", AVOID_PENALTY);
        break;
      case "overtime_deadline":
        p("job_hunt", AVOID_PENALTY_LIGHT);
        break;
      default:
        break;
    }
  }
}

function applyFocusBoosts(scores: Map<CalendarOpeningCategory, number>, focus: string[] | undefined): void {
  if (!focus?.length) return;
  const b = (cat: CalendarOpeningCategory, w: number) => bump(scores, cat, w);
  for (const k of focus) {
    switch (k) {
      case "work_career":
        b("job_hunt", FOCUS_BOOST);
        break;
      case "study_exam":
        b("school", FOCUS_BOOST);
        break;
      case "relationships":
        b("family", 2);
        b("date", 1);
        break;
      case "health_habit":
        b("health", FOCUS_BOOST);
        break;
      case "creative":
        b("hobby", FOCUS_BOOST);
        break;
      case "rest_recovery":
        b("health", 2);
        break;
      case "goals_habits":
        b("hobby", 2);
        break;
      case "family_home":
        b("family", FOCUS_BOOST);
        break;
      case "exam_path":
        b("school", FOCUS_BOOST);
        break;
      case "side_project":
        b("hobby", 2);
        b("parttime", 1);
        break;
      default:
        break;
    }
  }
}

function applyInterestPicks(
  scores: Map<CalendarOpeningCategory, number>,
  picks: string[] | undefined,
): void {
  if (!picks?.length) return;
  const acc = new Map<CalendarOpeningCategory, number>();
  for (const pick of picks) {
    for (const cat of calendarCategoriesForInterestPick(pick)) {
      acc.set(cat, (acc.get(cat) ?? 0) + INTEREST_BOOST_PER_CATEGORY);
    }
  }
  for (const [cat, add] of acc) {
    let capped = Math.min(add, MAX_INTEREST_BOOST_PER_CAT);
    if (cat === "hobby") capped = Math.min(add, 4);
    if (capped !== 0) bump(scores, cat, capped);
  }
}

/**
 * After calendar/rules built scores, apply profile layer (same Map).
 * Does not change priority order; shifts scores for tie-break / winner pick.
 */
export function applyProfileSignalsToOpeningScores(
  scores: Map<CalendarOpeningCategory, number>,
  profile: OpeningProfileSignalsInput | null | undefined,
): void {
  if (!profile) return;
  applyAvoidPenalties(scores, profile.aiAvoidTopics);
  applyFocusBoosts(scores, profile.aiCurrentFocus);
  applyInterestPicks(scores, profile.interestPicks);
}
