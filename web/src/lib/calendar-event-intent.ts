import type { CalendarOpeningCategory, CalendarOpeningSettings, UserProfileSettings } from "@/lib/user-settings";
import { applyProfileSignalsToOpeningScores } from "@/lib/calendar-opening-profile-signals";
import { scoreEventForAutoClassification, type AutoClassifyEvent } from "@/lib/calendar-opening-auto-score";

export type IntentConfidence = "high" | "medium" | "low";
export type IntentAskStyle = "assert_ok" | "light_confirm" | "parallel_confirm" | "defer";

export type IntentAxis =
  | "work_or_jobhunt"
  | "private_social"
  | "school"
  | "health"
  | "family"
  | "hobby_event"
  | "shopping_errand"
  | "exercise"
  | "travel"
  | "volunteer";

export type IntentEvidence = {
  kind:
    | "builtin"
    | "rule"
    | "calendar_default"
    | "calendar_name"
    | "duration_hint"
    | "keyword_axis"
    | "profile_focus"
    | "profile_interest"
    | "profile_avoid";
  note: string;
};

export type CalendarEventIntent = {
  bestCategory: CalendarOpeningCategory;
  topCategories: { category: CalendarOpeningCategory; score: number }[]; // sorted desc, top3
  deltaTop1Top2: number;
  confidence: IntentConfidence;
  axes: Record<IntentAxis, { score: number; confidence: IntentConfidence }>;
  ambiguityFlags: {
    opaqueTitle: boolean;
    competingAxes: boolean;
    workVsPrivate: boolean;
    schoolVsPrivate: boolean;
    healthVsErrand: boolean;
  };
  askStyle: IntentAskStyle;
  questionTemplateJa: string; // 1-sentence axis-explicit default
};

export type UserUtteranceEventLink = {
  method: "title_time_exact" | "title_fuzzy" | "semantic_hint" | "needs_confirm";
  matchedTitle?: string;
  matchedTime?: string;
  confidence: IntentConfidence;
};

function hhmmInTimeZone(isoLike: string, timeZone: string): string {
  if (!isoLike || /^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return "";
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function norm(s: string): string {
  return (s ?? "").normalize("NFKC").trim();
}

function safeLower(s: string): string {
  return norm(s).toLowerCase();
}

function isOpaqueTitle(titleRaw: string): boolean {
  const t = norm(titleRaw);
  if (!t) return true;
  if (t.length <= 4) return true;
  // Titles that are mostly a proper noun / token soup.
  if (/^[A-Za-z0-9 _.\-]{2,32}$/.test(t) && !/\b(meet|mtg|call|dinner|lunch|reservation)\b/i.test(t)) return true;
  if (/^[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9]+$/u.test(t) && t.length <= 8) return true;
  return false;
}

function axisConfidenceFromScore(score: number): IntentConfidence {
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function deriveTop3(scores: Map<CalendarOpeningCategory, number>): { top: { category: CalendarOpeningCategory; score: number }[]; delta: number } {
  const sorted = [...scores.entries()]
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  const top = sorted.slice(0, 3);
  const delta = (top[0]?.score ?? 0) - (top[1]?.score ?? 0);
  return { top, delta };
}

function categoryConfidence(deltaTop1Top2: number, top1Score: number): IntentConfidence {
  if (top1Score >= 18 && deltaTop1Top2 >= 8) return "high";
  if (top1Score >= 10 && deltaTop1Top2 >= 4) return "medium";
  return "low";
}

function axisFromCategory(cat: CalendarOpeningCategory): IntentAxis {
  if (cat === "job_hunt" || cat === "parttime") return "work_or_jobhunt";
  if (cat === "school") return "school";
  if (cat === "health") return "health";
  if (cat === "family" || cat === "date") return "family";
  if (cat === "hobby") return "hobby_event";
  return "private_social";
}

function keywordAxisScores(hayLower: string): Partial<Record<IntentAxis, number>> {
  const add: Partial<Record<IntentAxis, number>> = {};
  const bump = (k: IntentAxis, w: number) => (add[k] = (add[k] ?? 0) + w);

  // Travel / move
  if (/\b(flight|airport|hotel|check-?in|check-?out|travel)\b/.test(hayLower) || /(旅行|出張|移動|新幹線|飛行機|空港|ホテル|宿|チェックイン|チェックアウト)/.test(hayLower)) {
    bump("travel", 8);
  }
  // Exercise
  if (/\b(gym|yoga|run|running|workout|pilates)\b/.test(hayLower) || /(ジム|筋トレ|ランニング|ジョギング|ヨガ|ピラティス|運動)/.test(hayLower)) {
    bump("exercise", 7);
  }
  // Shopping / errands
  if (/\b(shop|shopping|grocery|errand)\b/.test(hayLower) || /(買い物|スーパー|ドラッグ|役所|銀行|郵便局|手続き)/.test(hayLower)) {
    bump("shopping_errand", 6);
  }
  // Volunteer / community
  if (/\b(volunteer|community)\b/.test(hayLower) || /(ボランティア|地域活動|清掃|奉仕)/.test(hayLower)) {
    bump("volunteer", 7);
  }
  return add;
}

function mergeAxisScore(base: Record<IntentAxis, number>, add: Partial<Record<IntentAxis, number>>): Record<IntentAxis, number> {
  const out = { ...base };
  for (const [k, v] of Object.entries(add) as [IntentAxis, number][]) {
    out[k] = (out[k] ?? 0) + (v ?? 0);
  }
  return out;
}

function buildDefaultQuestionTemplateJa(bestAxis: IntentAxis, altAxis: IntentAxis, profile?: UserProfileSettings | null): string {
  const tone = (profile?.aiChatTone ?? "").trim();
  const depth = (profile?.aiDepthLevel ?? "").trim();
  const direct = tone === "factual" || tone === "questions" || depth === "deep" || depth === "normal" || tone === "";
  const head = direct ? "" : "";
  // Base: axis-explicit (user preference).
  if (bestAxis === "work_or_jobhunt" || altAxis === "work_or_jobhunt") {
    return `${head}これって仕事/就活寄り？それとも友人/私用？`;
  }
  if (bestAxis === "school" || altAxis === "school") {
    return `${head}これって学校/授業系？それとも私用寄り？`;
  }
  if (bestAxis === "health" || altAxis === "health") {
    return `${head}これって通院/体調系？それとも別の用事？`;
  }
  return `${head}これってどんな用事だった？（仕事/就活寄り？それとも友人/私用？）`;
}

export function questionBudgetForPersona(args: {
  aiChatTone?: string | null;
  aiDepthLevel?: string | null;
  userMessageLen?: number | null;
}): { baseMaxQuestions: number; allowPlusOneWhenShort: boolean } {
  const tone = (args.aiChatTone ?? "").trim();
  const depth = (args.aiDepthLevel ?? "").trim();
  const len = typeof args.userMessageLen === "number" ? args.userMessageLen : null;
  // ok_hybrid baseline: 2 questions, +1 when user message is short and tone/depth allows.
  let base = 2;
  let plusOne = true;
  if (tone === "brief" || depth === "light") {
    base = 1;
    plusOne = len != null ? len <= 40 : true;
  }
  if (tone === "questions" || depth === "deep") {
    base = 2;
    plusOne = len != null ? len <= 120 : true;
  }
  return { baseMaxQuestions: base, allowPlusOneWhenShort: plusOne };
}

export function inferCalendarEventIntent(args: {
  ev: {
    title?: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    eventSearchBlob?: string;
    calendarId?: string;
    calendarName?: string;
    colorId?: string;
    fixedCategory?: string;
  };
  calendarOpening: CalendarOpeningSettings | null;
  profile?: Pick<UserProfileSettings, "interestPicks" | "aiAvoidTopics" | "aiCurrentFocus" | "aiChatTone" | "aiDepthLevel"> | null;
}): CalendarEventIntent {
  const desc = [args.ev.description, args.ev.eventSearchBlob].filter(Boolean).join("\n");
  const autoEv: AutoClassifyEvent = {
    title: args.ev.title,
    start: args.ev.start,
    end: args.ev.end,
    location: args.ev.location,
    description: desc,
    calendarId: args.ev.calendarId,
    calendarName: args.ev.calendarName,
    colorId: args.ev.colorId,
  };

  // Base category scoring (rules + builtin + duration + name boosts).
  const baseScores = scoreEventForAutoClassification(autoEv, args.calendarOpening ?? null);
  // Profile adjustments (avoid/focus/interest) — reuse opening profile logic.
  if (args.profile) {
    applyProfileSignalsToOpeningScores(baseScores, {
      interestPicks: args.profile.interestPicks,
      aiAvoidTopics: args.profile.aiAvoidTopics,
      aiCurrentFocus: args.profile.aiCurrentFocus,
    });
  }

  const { top, delta } = deriveTop3(baseScores);
  const bestCategory = (top[0]?.category ?? "other") as CalendarOpeningCategory;
  const bestScore = top[0]?.score ?? 0;
  const confidence = categoryConfidence(delta, bestScore);

  // Axis scores: map from top categories + keyword axes.
  const baseAxis: Record<IntentAxis, number> = {
    work_or_jobhunt: 0,
    private_social: 0,
    school: 0,
    health: 0,
    family: 0,
    hobby_event: 0,
    shopping_errand: 0,
    exercise: 0,
    travel: 0,
    volunteer: 0,
  };
  let axisScores = { ...baseAxis };
  for (const { category, score } of top) {
    const ax = axisFromCategory(category);
    axisScores[ax] += score;
    // Spread a bit to private_social for ambiguous/other-like categories so we can compare with work.
    if (category === "other") axisScores.private_social += Math.min(3, Math.max(1, score / 3));
  }
  const hayLower = [
    args.ev.title ?? "",
    args.ev.location ?? "",
    args.ev.description ?? "",
    args.ev.eventSearchBlob ?? "",
    args.ev.calendarName ?? "",
  ]
    .map(safeLower)
    .filter(Boolean)
    .join("\n");
  axisScores = mergeAxisScore(axisScores, keywordAxisScores(hayLower));

  const axes: CalendarEventIntent["axes"] = Object.fromEntries(
    (Object.keys(axisScores) as IntentAxis[]).map((k) => [k, { score: axisScores[k] ?? 0, confidence: axisConfidenceFromScore(axisScores[k] ?? 0) }]),
  ) as CalendarEventIntent["axes"];

  // Ambiguity: competing axes (user wants ask_if_competing_axes).
  const opaqueTitle = isOpaqueTitle(args.ev.title ?? "");
  const work = axes.work_or_jobhunt.score;
  const priv = axes.private_social.score + axes.family.score + axes.hobby_event.score;
  const school = axes.school.score;
  const health = axes.health.score;
  const err = axes.shopping_errand.score;

  const workVsPrivate = work > 0 && priv > 0 && Math.abs(work - priv) <= Math.max(6, Math.min(work, priv) * 0.6);
  const schoolVsPrivate = school > 0 && priv > 0 && Math.abs(school - priv) <= Math.max(6, Math.min(school, priv) * 0.6);
  const healthVsErrand = health > 0 && err > 0 && Math.abs(health - err) <= Math.max(5, Math.min(health, err) * 0.7);
  const competingAxes = workVsPrivate || schoolVsPrivate || healthVsErrand;

  const ambiguityFlags = {
    opaqueTitle,
    competingAxes,
    workVsPrivate,
    schoolVsPrivate,
    healthVsErrand,
  };

  const askStyle: IntentAskStyle = competingAxes
    ? "parallel_confirm"
    : confidence === "high" && !opaqueTitle
      ? "assert_ok"
      : opaqueTitle || confidence === "low"
        ? "light_confirm"
        : "light_confirm";

  // Choose two axes for template.
  const bestAxis = axisFromCategory(bestCategory);
  const altAxis = workVsPrivate
    ? "work_or_jobhunt"
    : schoolVsPrivate
      ? "school"
      : healthVsErrand
        ? "health"
        : "private_social";

  return {
    bestCategory,
    topCategories: top,
    deltaTop1Top2: delta,
    confidence,
    axes,
    ambiguityFlags,
    askStyle,
    questionTemplateJa: buildDefaultQuestionTemplateJa(bestAxis, altAxis, args.profile ?? null),
  };
}

export function linkUserUtteranceToSameDayEvent(args: {
  userMessage: string;
  timeZone: string;
  events: { title?: string; start: string; end: string }[];
}): UserUtteranceEventLink | null {
  const msg = norm(args.userMessage);
  if (!msg) return null;
  const msgLower = msg.toLowerCase();
  const dayEvents = args.events.slice(0, 40);

  // Exact-ish title substring.
  for (const ev of dayEvents) {
    const title = norm(ev.title ?? "");
    if (title && title.length >= 3 && msg.includes(title)) {
      const hm = hhmmInTimeZone(ev.start, args.timeZone);
      return { method: "title_time_exact", matchedTitle: title, matchedTime: hm || undefined, confidence: "high" };
    }
  }

  // Time mention (HH:mm or H時).
  const hmMatch = msg.match(/\b(\d{1,2}):(\d{2})\b/) ?? msg.match(/(\d{1,2})\s*時/);
  if (hmMatch) {
    const h = hmMatch[1] ? Number(hmMatch[1]) : NaN;
    if (Number.isFinite(h)) {
      // Find event within +/- 1h by local hour match.
      for (const ev of dayEvents) {
        const hm = hhmmInTimeZone(ev.start, args.timeZone);
        const eh = hm ? Number(hm.split(":")[0]) : NaN;
        if (Number.isFinite(eh) && Math.abs(eh - h) <= 1) {
          const title = norm(ev.title ?? "");
          return { method: "title_fuzzy", matchedTitle: title || undefined, matchedTime: hm || undefined, confidence: "medium" };
        }
      }
    }
  }

  // Semantic hints (very light): keywords → ambiguous link, ask confirm.
  const semantic =
    /(面接|説明会|インターン|就活|バイト|シフト|授業|講義|病院|通院|ジム|旅行|ホテル|空港|予約|レストラン|飲み会)/.test(msgLower) ||
    /\b(interview|intern|shift|class|hospital|gym|travel|hotel|airport|reservation|restaurant)\b/.test(msgLower);
  if (semantic && dayEvents.length > 0) {
    return { method: "needs_confirm", confidence: "low" };
  }
  return null;
}

export function formatNonOpeningCalendarIntentSummaryBlock(args: {
  entryDateYmd: string;
  timeZone: string;
  events: {
    title?: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    eventSearchBlob?: string;
    calendarId?: string;
    calendarName?: string;
    colorId?: string;
    fixedCategory?: string;
  }[];
  calendarOpening: CalendarOpeningSettings | null;
  profile?: Pick<UserProfileSettings, "interestPicks" | "aiAvoidTopics" | "aiCurrentFocus" | "aiChatTone" | "aiDepthLevel"> | null;
}): string {
  if (!args.events.length) {
    return ["## カレンダー推論サマリ（当日・通常ターン）", "（当日の予定なし）"].join("\n");
  }
  const items = args.events
    .slice()
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 5)
    .map((ev) => {
      const t = hhmmInTimeZone(ev.start, args.timeZone);
      const when = t || "終日";
      const title = norm(ev.title ?? "") || "（タイトルなし）";
      const intent = inferCalendarEventIntent({
        ev,
        calendarOpening: args.calendarOpening,
        profile: args.profile ?? null,
      });
      const ask =
        intent.askStyle === "assert_ok"
          ? "assert_ok"
          : intent.askStyle === "parallel_confirm"
            ? "parallel_confirm"
            : "light_confirm";
      return `- time=${when} | title=${title} | best=${intent.bestCategory} | conf=${intent.confidence} | ask=${ask}`;
    });

  const anyAmb = items.some((l) => l.includes("ask=parallel_confirm") || l.includes("conf=low"));
  const guidance = anyAmb
    ? "※ 一部の予定は軸が競合/不透明です。断定せず、必要なら「仕事/就活？それとも友人/私用？」の形で短く確認する。"
    : "※ サマリは推論ヒント。断定しすぎない。";

  return ["## カレンダー推論サマリ（当日・通常ターン）", `対象日 ${args.entryDateYmd}（上位5件のみ）`, ...items, guidance].join("\n");
}

