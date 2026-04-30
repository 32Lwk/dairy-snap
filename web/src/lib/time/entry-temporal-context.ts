import {
  diffCalendarDaysInZone,
  formatHmInTimeZone,
  formatYmdInTimeZone,
  getEffectiveTodayYmd,
  hmToMinutes,
  isValidIanaTimeZone,
  resolveDayBoundaryEndTime,
} from "@/lib/time/user-day-boundary";
import { formatHmTokyo, formatYmdTokyo } from "@/lib/time/tokyo";
import { getLocalSolarPhaseForEntryDay } from "@/lib/time/local-solar-phase";

function startOfDayTokyoMs(ymd: string): number {
  return new Date(`${ymd}T00:00:00+09:00`).getTime();
}

/** Calendar-day delta in Asia/Tokyo: `toYmd` minus `fromYmd` (0 if same day). */
export function diffCalendarDaysTokyo(fromYmd: string, toYmd: string): number {
  const msPerDay = 86_400_000;
  return Math.round((startOfDayTokyoMs(toYmd) - startOfDayTokyoMs(fromYmd)) / msPerDay);
}

export type EntryTemporalKind =
  | "future"
  | "today"
  | "yesterday"
  | "few_days"
  | "about_week"
  | "two_weeks"
  | "about_month"
  | "months"
  | "year_plus";

export type EntryTemporalContext = {
  kind: EntryTemporalKind;
  /** todayYmd minus entryDateYmd; negative if entry date is in the future */
  daysDiff: number;
  todayYmd: string;
  summaryJa: string;
  orchestratorInstructions: string;
  journalComposerInstructions: string;
};

function classifyKind(daysDiff: number): EntryTemporalKind {
  if (daysDiff < 0) return "future";
  if (daysDiff === 0) return "today";
  if (daysDiff === 1) return "yesterday";
  if (daysDiff >= 2 && daysDiff <= 6) return "few_days";
  if (daysDiff >= 7 && daysDiff <= 13) return "about_week";
  if (daysDiff >= 14 && daysDiff <= 27) return "two_weeks";
  if (daysDiff >= 28 && daysDiff <= 89) return "about_month";
  if (daysDiff >= 90 && daysDiff <= 364) return "months";
  return "year_plus";
}

function linesEn(...parts: string[]): string {
  return parts.join("\n");
}

export type EntryTemporalOpts = {
  timeZone?: string;
  dayBoundaryEndTime?: string | null;
};

/**
 * Temporal framing for reflective chat and AI diary (entry date vs effective "today" in user TZ).
 * Instructions are in English to avoid tooling encoding issues; model replies stay Japanese.
 */
export function getEntryTemporalContext(
  entryDateYmd: string,
  now: Date = new Date(),
  opts?: EntryTemporalOpts,
): EntryTemporalContext {
  const tz =
    opts?.timeZone && isValidIanaTimeZone(opts.timeZone) ? opts.timeZone : "Asia/Tokyo";
  const boundary = resolveDayBoundaryEndTime(opts?.dayBoundaryEndTime ?? null);
  const todayYmd = getEffectiveTodayYmd(now, tz, boundary);
  const daysDiff = diffCalendarDaysInZone(entryDateYmd, todayYmd, tz);
  const kind = classifyKind(daysDiff);

  if (kind === "future") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は今日（${todayYmd}）より未来です。`,
      orchestratorInstructions: linesEn(
        `Entry date ${entryDateYmd} is AFTER generator "today" (${todayYmd}) in ${tz}.`,
        "Treat as possible planned day / typo / future schedule. Do not narrate as if the day already happened as fixed fact.",
        "Use wording like plans, expectations, or gently confirm the date if needed.",
        "If the user clearly speaks in past tense about that date, follow them and switch to retrospective tone.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date vs today (required)",
        `- Entry: ${entryDateYmd}. Generator \"today\": ${todayYmd} (future-looking).`,
        "- Draft must not invent completed events. Only facts the user confirmed in chat.",
        "- Adjust headings if needed (e.g. plans vs recap).",
      ),
    };
  }

  if (kind === "today") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は今日（${todayYmd}）と同じです。`,
      orchestratorInstructions: linesEn(
        `This thread is for TODAY (${entryDateYmd}) (generator "today" ${todayYmd} in ${tz}).`,
        "You may use \"today\" / 今日 naturally for that calendar day.",
        "Even just after local midnight, if the entry date is still \"today\", keep same-day framing.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Diary target day is TODAY (${entryDateYmd}).`,
        "- Use template headings \"今日のまとめ\" and \"明日\" as written in the journal prompt.",
      ),
    };
  }

  if (kind === "yesterday") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は昨日（1 日前）です。`,
      orchestratorInstructions: linesEn(
        `This thread recalls YESTERDAY: ${entryDateYmd} (exactly 1 calendar day before ${todayYmd} in ${tz}).`,
        "Never use 今日は to mean that entry day. Use 昨日は / きのう / あの日は — past day only.",
        "Weather and calendar tools refer to THAT past day, not the current wall-clock \"today\".",
        "Assume the user may be backfilling the diary; tone stays retrospective past.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Target day is YESTERDAY (${entryDateYmd}); \"now\" is ${todayYmd}.`,
        "- Replace heading `## \u4eca\u65e5\u306e\u307e\u3068\u3081\uff08AI\uff09` with `## \u3053\u306e\u65e5\u306e\u307e\u3068\u3081\uff08AI\uff09`.",
        "- Replace `### \u660e\u65e5\uff08\u6b21\u306e\u4e00\u6b69\uff09` with a past-friendly heading (e.g. kinou no ato / ima furikaeru to).",
        "- Past tense. Do not use \u4eca\u65e5\u306f for that entry day.",
      ),
    };
  }

  if (kind === "few_days") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は ${daysDiff} 日前です。`,
      orchestratorInstructions: linesEn(
        `Entry day ${entryDateYmd} is ${daysDiff} calendar days before generator today (${todayYmd}) in ${tz}.`,
        "Do not use 今日は for that entry day. Frame as a specific past day (数日前 / その日は).",
        "Memory may be fuzzy — prefer gentle check-ins over hard assertions.",
        "Conversation should support a past-tense diary for THAT day.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Target: ${entryDateYmd} (${daysDiff} days before ${todayYmd}).`,
        "- Use `## この日のまとめ（AI）` not 今日のまとめ.",
        "- Rework \"明日\" into next step from that time or reflection from now.",
        "- Past tense; no 今日は for the entry day.",
      ),
    };
  }

  if (kind === "about_week") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `\u5bfe\u8c61\u65e5 ${entryDateYmd} \u306f\u7d041\u9031\u9593\u524d\uff08${daysDiff}\u65e5\u524d\uff09\u3067\u3059\u3002`,
      orchestratorInstructions: linesEn(
        `Entry day ${entryDateYmd} is about one week ago (${daysDiff} days before ${todayYmd}).`,
        "No 今日は for that day. Expect vaguer memory; do not pressure for precision.",
        "You may reference \"the week around that day\" or lingering mood.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Target: ${entryDateYmd} (~1 week ago, ${daysDiff} days back).`,
        "- Past-tense recap headings like この日のまとめ. Match certainty to what the user said.",
      ),
    };
  }

  if (kind === "two_weeks") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `\u5bfe\u8c61\u65e5 ${entryDateYmd} \u306f\u7d042\u9031\u9593\u524d\uff08${daysDiff}\u65e5\u524d\uff09\u3067\u3059\u3002`,
      orchestratorInstructions: linesEn(
        `Entry day ${entryDateYmd} is ~2 weeks ago (${daysDiff} days before ${todayYmd}).`,
        "Mid-range retrospective: events, impressions, relationship shifts. No 今日は.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Target: ${entryDateYmd} (~2 weeks, ${daysDiff} days back).`,
        "- Past tense; map template \"\u660e\u65e5\" to \"\u305d\u306e\u3053\u308d\u306e\u6b21\u306e\u4e00\u6b69\" / \"\u3044\u307e\u632f\u308a\u8fd4\u308b\u3068\".",
      ),
    };
  }

  if (kind === "about_month") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は約 1 か月前（${daysDiff} 日前）です。`,
      orchestratorInstructions: linesEn(
        `Entry day ${entryDateYmd} is about a month ago (${daysDiff} days before ${todayYmd}).`,
        "Broader lens: patterns, turning points. No 今日は. Allow uncertainty.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Target: ${entryDateYmd} (~1 month, ${daysDiff} days back).`,
        "- Snapshot of that day in past tense; separate inference from stated facts.",
      ),
    };
  }

  if (kind === "months") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は数か月前（${daysDiff} 日前）です。`,
      orchestratorInstructions: linesEn(
        `Entry day ${entryDateYmd} is several months ago (${daysDiff} days before ${todayYmd}).`,
        "Blend \"then\" and \"looking back now\". Nostalgia and change; no 今日は.",
      ),
      journalComposerInstructions: linesEn(
        "## Entry date (required)",
        `- Target: ${entryDateYmd} (${daysDiff} days back).`,
        "- Past-day diary; optional short \"from today's perspective\" if chat supports it.",
      ),
    };
  }

  return {
    kind,
    daysDiff,
    todayYmd,
    summaryJa: `対象日 ${entryDateYmd} は 1 年以上前（${daysDiff} 日前）です。`,
    orchestratorInstructions: linesEn(
      `Entry day ${entryDateYmd} is 1+ years ago (${daysDiff} days before ${todayYmd}).`,
      "Respect the past; emphasize distance and growth. No 今日は. Avoid precise claims the user did not confirm.",
    ),
    journalComposerInstructions: linesEn(
      "## Entry date (required)",
      `- Target: ${entryDateYmd} (1+ years, ${daysDiff} days back).`,
      "- Past tense historical snapshot; replace \"明日\" with \"そのころの次\" / \"いま振り返ると\".",
    ),
  };
}

/**
 * Same `## …` heading as the calendar bullet list injected in `runOrchestrator` system prompt.
 * Keep in sync with `web/src/server/orchestrator.ts`.
 */
export const ORCHESTRATOR_DAY_CALENDAR_HEADING = "## その日の予定（Google カレンダー・対象日）";

/** Grounding rules: long-term memory must not be treated as the entry day's schedule */
export function formatOrchestratorScheduleGroundingBlock(): string {
  return linesEn(
    "## Facts / schedule grounding (must follow)",
    `You may mention concrete plans, trips, classes, or named events **on the entry date** only if they appear in: (1) tool outputs for that date, (2) this entry's diary body, (3) the "## 短期（この日・参考）" section, or (4) the "${ORCHESTRATOR_DAY_CALENDAR_HEADING}" block in this system message (same-day events synced from Google Calendar; when that block is present, treat its listed titles and times as factual for that entry date).`,
    "Long-term memory (reference bullets) is cross-time user context. **Never treat it as that day's calendar** and do not invent or stack same-day events from it alone.",
    "If tools return no events or you lack detail, invite the user in general terms — do not fabricate event titles, places, or itineraries.",
  );
}

/** When chat drifts from same-day reflection, re-anchor with timeline or alternate same-day angles */
export function formatOrchestratorConversationScopeBlock(): string {
  return linesEn(
    "## Conversation scope / topic recovery (must follow)",
    "Primary goal: draw out first-person detail for the **entry date** (see 「対象日」 / date-framing block) to support journaling — not open-ended chat unrelated to that day.",
    "If the last turns drift (one micro-topic stuck without progress, abstract meta talk, or long digression on another calendar day with little tie to this entry), give one short empathic line then **deliberately change topic**.",
    "Preferred pivots (no invented times/events; keep questions general if facts are unknown):",
    "- Same-day **timeline**: waking / morning, midday, approximate meet or block start–end and what happened before/after, meals (what / where / with whom), evening through night. If temporal framing marks the entry as **today**, you may ask what they plan to do next.",
    "- Same-day **alternate angle** not yet covered: transit, energy/mood vs weather, plan vs what actually happened, small vivid moments.",
    "If the user brings up another day, acknowledge briefly then bridge back to the entry date's flow. After a pivot, **one question only**; keep total reply ~2–4 short sentences.",
  );
}

/** Orchestrator system prompt block */
export function formatOrchestratorTemporalBlock(
  entryDateYmd: string,
  now?: Date,
  opts?: EntryTemporalOpts,
): string {
  const ctx = getEntryTemporalContext(entryDateYmd, now ?? new Date(), opts);
  return ["## Date framing for this thread (must follow)", ctx.summaryJa, "", ctx.orchestratorInstructions].join("\n");
}

/**
 * Wall-clock (Tokyo) + local sunrise/sunset phase when the entry is Tokyo-"today".
 * English for model instructions; user-visible replies stay Japanese.
 */
export function formatOrchestratorWallClockDaylightBlock(params: {
  entryDateYmd: string;
  now: Date;
  lat: number;
  lon: number;
  timeZone?: string;
  dayBoundaryEndTime?: string | null;
}): string {
  const { entryDateYmd, now, lat, lon } = params;
  const tz =
    params.timeZone && isValidIanaTimeZone(params.timeZone) ? params.timeZone : "Asia/Tokyo";
  const boundary = resolveDayBoundaryEndTime(params.dayBoundaryEndTime ?? null);
  const todayYmd = getEffectiveTodayYmd(now, tz, boundary);
  const calYmd = formatYmdInTimeZone(now, tz);
  const hm = formatHmInTimeZone(now, tz);
  const daysDiff = diffCalendarDaysInZone(entryDateYmd, todayYmd, tz);

  const lines: string[] = [
    "## Wall clock & daylight (tone; must follow)",
    `- Generator wall time (${tz}): **${hm}** on calendar date **${calYmd}**; effective \"app today\" **${todayYmd}** (day-boundary aware).`,
    `- Diary entry date: **${entryDateYmd}** (${
      daysDiff === 0
        ? 'same as effective "today"'
        : daysDiff > 0
          ? `${daysDiff} calendar day(s) before effective "today"`
          : `${-daysDiff} calendar day(s) after effective "today" (future entry)`
    }).`,
  ];

  if (daysDiff === 0) {
    const sol = getLocalSolarPhaseForEntryDay(entryDateYmd, now, lat, lon);
    if (sol.phase === "unknown") {
      lines.push(
        `- Local solar phase at user coordinates: **unknown** (polar night/day edge, invalid geometry, or library limits). **Do not** claim exact sunrise/sunset times, whether it is still dark outside, or 「まだ夜明け前」 / 「もう昼」 as fact. Use only the **wall clock (${tz})** above for "now"; keep weather/outdoor wording **tentative** (e.g. 予報では / かもしれない). If unsure, ask a neutral question instead of asserting light conditions.`,
      );
    } else {
      const sr = sol.sunrise ? formatHmInTimeZone(sol.sunrise, tz) : "?";
      const ss = sol.sunset ? formatHmInTimeZone(sol.sunset, tz) : "?";
      lines.push(
        `- For this entry day at user coordinates, versus **now**: **${sol.phase}** (approx. sunrise **${sr}** / sunset **${ss}**, clock shown in ${tz} for those instants).`,
      );
      if (sol.phase === "before_sunrise") {
        lines.push(
          `- **before_sunrise** on an entry-today thread: do **not** write as if it is already broad daylight; do **not** push going outside for sunshine or 「よく晴れた一日」-style past-day sunshine. Forecast may still mention clear skies later — use soft wording (e.g. 予報では). **Prioritize** the **day ahead**: calendar blocks, **classes / lectures** (e.g. 何限から), **how they will spend time until** the next fixed plan; optionally a **light** mention of **夢** if tone fits. **Do not** make **眠さ / 寝足りなさ** the main hook unless the user already said they are tired.`,
        );
      } else if (sol.phase === "after_sunset") {
        lines.push(
          `- **after_sunset** on an entry-today thread: prefer evening/night framing for \"right now\"; weather lines describe the calendar day overall — use past or soft wording for outdoor brightness \"now\".`,
        );
      } else {
        lines.push(
          `- **daytime**: daylight / outdoor references are more plausible; still ground only in forecast labels and other supplied facts.`,
        );
      }
    }
  } else {
    lines.push(
      `- Entry is not effective-"today"; the opening reflects **that entry day**. Wall time above is the user's **current** moment — avoid a tone that ignores it (e.g. midday small-talk at 04:30).`,
    );
  }

  return lines.join("\n");
}

/**
 * "Late-night boundary" handling for users who want to treat after-midnight as "still yesterday".
 * This does NOT change the thread's entry date; it only guides tone and optional suggestion.
 */
export function formatOrchestratorDayBoundaryBlock(params: {
  entryDateYmd: string;
  now: Date;
  dayBoundaryEndTime?: string | null;
  timeZone?: string;
}): string {
  const { entryDateYmd, now, dayBoundaryEndTime } = params;
  const tz =
    params.timeZone && isValidIanaTimeZone(params.timeZone) ? params.timeZone : "Asia/Tokyo";
  const boundary = resolveDayBoundaryEndTime(dayBoundaryEndTime ?? null);
  const boundaryMin = hmToMinutes(boundary);
  if (boundaryMin == null) return "";

  const nowHm = formatHmInTimeZone(now, tz);
  const nowMin = hmToMinutes(nowHm) ?? 0;
  const effectiveToday = getEffectiveTodayYmd(now, tz, boundary);

  const inWindow = entryDateYmd === effectiveToday && nowMin >= 0 && nowMin < boundaryMin;
  if (!inWindow) return "";

  return [
    "## Day boundary preference (late-night; must follow)",
    `- User-defined day boundary end time: **${boundary}** (${tz}).`,
    `- Wall time now: **${nowHm}**; this is within the \"still yesterday\" window (00:00–${boundary}).`,
    "Guidance:",
    "- The thread's entry date is still the calendar day shown under 「対象日」. Do not rewrite dates as if the system changed the entry day.",
    "- However, it is appropriate to frame the moment as \"late night\" / 夜更かし / まだ前日の続きの感覚, and to gently offer the user a choice:",
    "  - Option A: reflect on the previous day (yesterday / きのう) first, because it still feels ongoing.",
    "  - Option B: start the new day (today) planning / intentions.",
    "- Keep it short (2–4 sentences) with at most one question sentence. Avoid asserting what the user did; invite them to choose.",
  ].join("\n");
}

/** Prefixed to journal composer user message */
export function formatJournalComposerTemporalPreamble(
  entryDateYmd: string,
  now?: Date,
  opts?: EntryTemporalOpts,
): string {
  const ctx = getEntryTemporalContext(entryDateYmd, now, opts);
  const elapsed =
    ctx.daysDiff < 0 ? `future by ${-ctx.daysDiff}d` : ctx.daysDiff === 0 ? "same day" : `${ctx.daysDiff}d ago`;
  return [
    ctx.journalComposerInstructions,
    "",
    `(entryYmd: ${entryDateYmd} / generatorToday: ${ctx.todayYmd} / offset: ${elapsed})`,
    "",
  ].join("\n");
}

export type ReflectiveOpeningContext = {
  hasDiaryBody: boolean;
  calendarLinked: boolean;
  calendarEventCount: number;
  /** 今日のエントリで、登録時間割から「この後の講義」行が付いた */
  hasTimetableLecturesToday?: boolean;
  /** 祝日/休日のシグナル（カレンダー or 日付判定）。開口では講義の断定を避ける。 */
  holidayNameJa?: string | null;
};

/**
 * Opening-turn instructions (system prompt only). Never put this in a user message — models may echo it.
 */
export function buildReflectiveOpeningSystemInstruction(
  entryDateYmd: string,
  now?: Date,
  opening?: ReflectiveOpeningContext,
  opts?: EntryTemporalOpts,
): string {
  const ctx = getEntryTemporalContext(entryDateYmd, now ?? new Date(), opts);
  const task =
    ctx.kind === "today"
      ? "The user has not spoken yet. Send 2–6 short sentences in natural Japanese as the first reflective line for TODAY. Length is a soft cap: include every **mandatory anchor** below (weather hooks, calendar/shift titles, timetable subject or 何限, day-boundary tone) even if that needs an extra sentence — do **not** drop anchors just to stay ultra-short."
      : ctx.kind === "future"
        ? `Entry date ${entryDateYmd} is after generator today ${ctx.todayYmd}. Open gently; plans may be uncertain. You may lightly confirm the date.`
        : ctx.kind === "yesterday"
          ? `The user is reflecting on YESTERDAY (${entryDateYmd}). Use past-day wording (e.g. きのう / あの日). Do not use 今日は for that entry day.`
          : `The user is reflecting on a PAST day: ${entryDateYmd} (${ctx.daysDiff} calendar days before ${ctx.todayYmd}). Past tense framing; do not use 今日は for that entry day.`;

  const anchorRules: string[] = [];
  if (opening) {
    const timetableLectureAnchor =
      opening.hasTimetableLecturesToday && opening.holidayNameJa
        ? "From 「時間割ベースのこの後の講義」, still touch **at least one** concrete **科目名** (light paraphrase OK) **or** **何限** — but **do not assert** lectures happened (holiday rule). Use **tentative** framing (e.g. 時間割だと〜 / もし学校があれば) or fold into **one** neutral check question with the holiday line. **Not enough:** vague 「木曜の授業日」「講義の日」 with **no** subject and **no** period."
        : opening.hasTimetableLecturesToday
          ? "From 「時間割ベースのこの後の講義」, you **must** name **at least one** concrete **科目名** (copy or light paraphrase from that block) **or** **何限** (e.g. 3限). **Not enough:** vague phrases like 「木曜の授業日」「講義の日」「授業があった日」 with **no** subject name and **no** period."
          : "";

    if (opening.hasDiaryBody) {
      anchorRules.push(
        "Open with at least one concrete hook from 「## 本文（このエントリ）」 (paraphrase lightly; add no facts absent from that section).",
      );
    }
    if (opening.calendarLinked) {
      if (opening.calendarEventCount > 0) {
        const calOnly = `Plans on this day: use only titles and times from 「${ORCHESTRATOR_DAY_CALENDAR_HEADING}」. When you mention a timed plan, include at least one real event title from that list in the same reply (do not stop at vague 「〇時の予定」 alone when a title exists). Do not invent extra appointments or a busier day.`;
        if (timetableLectureAnchor) {
          anchorRules.push(
            `${calOnly} **Also** ${timetableLectureAnchor} **Balance** calendar vs lectures — follow 「### 開口優先」 ordering (Impact×proximity): do **not** mention only a **distant** calendar event when a **sooner lecture** appears in the timetable block or higher in the priority list.`,
          );
        } else {
          anchorRules.push(calOnly);
        }
      } else if (opening.hasTimetableLecturesToday) {
        anchorRules.push(
          `The calendar summary may list no (or almost no) events — anchor the opening on 「時間割ベースのこの後の講義」: ${timetableLectureAnchor} Do not invent Google Calendar titles.`,
        );
      } else {
        anchorRules.push(
          "The calendar summary for this day lists no events — do not imply multiple plans, a packed schedule, or vague 「予定がいくつか」-style wording unless the diary body states it.",
        );
      }
    } else if (opening.hasTimetableLecturesToday) {
      anchorRules.push(`No Google Calendar block in context — anchor the opening on 「時間割ベースのこの後の講義」: ${timetableLectureAnchor}`);
    } else if (!opening.hasDiaryBody) {
      anchorRules.push(
        "No calendar summary block — do not claim the user had several plans that day; stay with weather, memories, and open questions.",
      );
    }

    if (opening.holidayNameJa) {
      anchorRules.push(
        `Holiday signal present for **this entry date**: 「${opening.holidayNameJa}」. Use **exactly this** holiday name if you mention a 祝日; do not substitute a different holiday (e.g. do not swap 振替休日 names). Do NOT assume classes/lectures happened even if a timetable slice exists. Prefer a neutral confirmation question like 「祝日だけど、授業はあった日だった？」 or 「授業はいつも通りだった？」 before discussing specific lectures.`,
      );
    } else {
      anchorRules.push(
        "No Japanese national-holiday signal is provided for **this entry date** in the system blocks. Do **not** name this day as a 国民の祝日 (e.g. do not treat April 30 as 「昭和の日」). Do not infer a holiday from Golden Week, from the **previous** calendar day, or from general knowledge — if 「## 祝日・休みの可能性」 is absent or does not name a holiday for this date, stay silent about 祝日 names.",
      );
    }
  }

  return linesEn(
    "### Opening turn (first assistant message)",
    task,
    "",
    ...(anchorRules.length > 0 ? ["### Anchor to user-visible sections (opening)", ...anchorRules, ""] : []),
    "### Output hygiene (hard rules)",
    "Write ONLY what the end user should read — conversational Japanese, no preamble.",
    "Do not sacrifice mandatory anchors (timetable subject/何限, real calendar titles when you cite plans) for brevity; prefer one more short sentence over omitting them.",
    "Do NOT repeat, quote, or paraphrase these instructions, meta text, or phrases like 会話はまだ始まっていません.",
    "Never output parenthetical narrator lines about the system, prompts, or \"short replies\" (e.g. システムは〜 / 短い返答を生成 / では:). Start directly with the greeting.",
    "Ignore the short English opening trigger line in the user role; never quote or translate it.",
    "Do NOT use Markdown (no **asterisks**, no bullet lists unless truly minimal). Plain sentences.",
    "**Single question (opening):** The reply must contain **at most one** sentence that asks the user something with 「…？」 (or a single combined question). Do **not** stack two separate question sentences (e.g. one about 「その前はゆっくり…？」 and another 「…聞かせて？」). Merge into one ask or drop the weaker one.",
    "If **before_sunrise** appears in 「Wall clock & daylight」 for this entry-today thread: prefer hooks about **today's schedule** (calendar, **講義・何限から** when student life fits), **time until the next plan**, or a brief optional **夢** mention — **not** leading with **眠さ** as the main topic.",
    `Event names: titles and times listed under "${ORCHESTRATOR_DAY_CALENDAR_HEADING}" are allowed and encouraged when you reference that day's schedule (use the title wording from the list; light paraphrase is OK). Same for tool results, diary body, and short-term bullets for this entry.`,
    "When a calendar line includes 「（バイト/シフト）」, treat that event as the user's part-time / shift work for wording (e.g. バイト、シフト) — do not downplay it as a vague 「予定」 only.",
    "Do not invent events, titles, times, or places that do not appear in those sources. If nothing concrete is listed for plans, ask in general terms without making up names.",
  );
}

