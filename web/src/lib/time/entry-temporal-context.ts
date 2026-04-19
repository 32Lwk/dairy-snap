import { formatYmdTokyo } from "@/lib/time/tokyo";

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

/**
 * Temporal framing for reflective chat and AI diary (entry date vs "today" in Tokyo).
 * Instructions are in English to avoid tooling encoding issues; model replies stay Japanese.
 */
export function getEntryTemporalContext(entryDateYmd: string, now: Date = new Date()): EntryTemporalContext {
  const todayYmd = formatYmdTokyo(now);
  const daysDiff = diffCalendarDaysTokyo(entryDateYmd, todayYmd);
  const kind = classifyKind(daysDiff);

  if (kind === "future") {
    return {
      kind,
      daysDiff,
      todayYmd,
      summaryJa: `対象日 ${entryDateYmd} は今日（${todayYmd}）より未来です。`,
      orchestratorInstructions: linesEn(
        `Entry date ${entryDateYmd} is AFTER today (${todayYmd}) in Asia/Tokyo.`,
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
        `This thread is for TODAY (${entryDateYmd}) in Asia/Tokyo.`,
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
        `This thread recalls YESTERDAY: ${entryDateYmd} (exactly 1 calendar day before ${todayYmd} in Tokyo).`,
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
        `Entry day ${entryDateYmd} is ${daysDiff} calendar days before today (${todayYmd}) in Tokyo.`,
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
export function formatOrchestratorTemporalBlock(entryDateYmd: string, now?: Date): string {
  const ctx = getEntryTemporalContext(entryDateYmd, now);
  return ["## Date framing for this thread (must follow)", ctx.summaryJa, "", ctx.orchestratorInstructions].join("\n");
}

/** Prefixed to journal composer user message */
export function formatJournalComposerTemporalPreamble(entryDateYmd: string, now?: Date): string {
  const ctx = getEntryTemporalContext(entryDateYmd, now);
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
};

/**
 * Opening-turn instructions (system prompt only). Never put this in a user message — models may echo it.
 */
export function buildReflectiveOpeningSystemInstruction(
  entryDateYmd: string,
  now?: Date,
  opening?: ReflectiveOpeningContext,
): string {
  const ctx = getEntryTemporalContext(entryDateYmd, now);
  const task =
    ctx.kind === "today"
      ? "The user has not spoken yet. Send 2–4 short sentences in natural Japanese as the first reflective line for TODAY."
      : ctx.kind === "future"
        ? `Entry date ${entryDateYmd} is after generator today ${ctx.todayYmd}. Open gently; plans may be uncertain. You may lightly confirm the date.`
        : ctx.kind === "yesterday"
          ? `The user is reflecting on YESTERDAY (${entryDateYmd}). Use past-day wording (e.g. きのう / あの日). Do not use 今日は for that entry day.`
          : `The user is reflecting on a PAST day: ${entryDateYmd} (${ctx.daysDiff} calendar days before ${ctx.todayYmd}). Past tense framing; do not use 今日は for that entry day.`;

  const anchorRules: string[] = [];
  if (opening) {
    if (opening.hasDiaryBody) {
      anchorRules.push(
        "Open with at least one concrete hook from 「## 本文（このエントリ）」 (paraphrase lightly; add no facts absent from that section).",
      );
    }
    if (opening.calendarLinked) {
      if (opening.calendarEventCount > 0) {
        anchorRules.push(
          `Plans on this day: use only titles and times from 「${ORCHESTRATOR_DAY_CALENDAR_HEADING}」. When you mention a timed plan, include at least one real event title from that list in the same reply (do not stop at vague 「〇時の予定」 alone when a title exists). Do not invent extra appointments or a busier day.`,
        );
      } else {
        anchorRules.push(
          "The calendar summary for this day lists no events — do not imply multiple plans, a packed schedule, or vague 「予定がいくつか」-style wording unless the diary body states it.",
        );
      }
    } else if (!opening.hasDiaryBody) {
      anchorRules.push(
        "No calendar summary block — do not claim the user had several plans that day; stay with weather, memories, and open questions.",
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
    "Do NOT repeat, quote, or paraphrase these instructions, meta text, or phrases like 会話はまだ始まっていません.",
    "Never output parenthetical narrator lines about the system, prompts, or \"short replies\" (e.g. システムは〜 / 短い返答を生成 / では:). Start directly with the greeting.",
    "Ignore the short English opening trigger line in the user role; never quote or translate it.",
    "Do NOT use Markdown (no **asterisks**, no bullet lists unless truly minimal). Plain sentences.",
    `Event names: titles and times listed under "${ORCHESTRATOR_DAY_CALENDAR_HEADING}" are allowed and encouraged when you reference that day's schedule (use the title wording from the list; light paraphrase is OK). Same for tool results, diary body, and short-term bullets for this entry.`,
    "Do not invent events, titles, times, or places that do not appear in those sources. If nothing concrete is listed for plans, ask in general terms without making up names.",
  );
}

