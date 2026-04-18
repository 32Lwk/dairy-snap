import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { refineCalendarCategoryWithCheapLlm } from "@/lib/ai/calendar-classify-llm";
import {
  aggregateCalendarAutoClassification,
  pickTopTwoFromTotals,
  shouldRefineWithLlm,
  type AutoClassifyEvent,
} from "@/lib/calendar-opening-auto-score";
import { requireSession } from "@/lib/api/require-session";
import {
  CALENDAR_OPENING_BUILTIN_IDS,
  type BuiltinCalendarOpeningCategory,
  type CalendarOpeningCategory,
  type CalendarOpeningSettings,
} from "@/lib/user-settings";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  title: z.string().max(2000).optional(),
  start: z.string().max(80),
  end: z.string().max(80),
  location: z.string().max(2000).optional(),
  description: z.string().max(8000).optional(),
  calendarId: z.string().max(400).optional(),
  calendarName: z.string().max(200).optional(),
  colorId: z.string().max(32).optional(),
});

const openingMini = z
  .object({
    rules: z
      .array(
        z.object({
          kind: z.string().max(32),
          value: z.string().max(120),
          category: z.string().max(48),
          weight: z.number().min(-50).max(120).optional(),
        }),
      )
      .max(120)
      .optional(),
    priorityOrder: z.array(z.string().max(48)).max(32).optional(),
    customCategoryLabels: z.array(z.string().min(1).max(24)).max(16).optional(),
  })
  .optional();

const bodySchema = z.object({
  calendarId: z.string().min(1).max(400),
  calendarName: z.string().max(200).optional(),
  events: z.array(eventSchema).max(2000),
  calendarOpening: openingMini,
});

function isBuiltinCategory(c: string): c is BuiltinCalendarOpeningCategory {
  return (CALENDAR_OPENING_BUILTIN_IDS as readonly string[]).includes(c);
}

function totalsToRecord(totals: Map<CalendarOpeningCategory, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of totals) {
    o[k] = v;
  }
  return o;
}

function sampleTitles(events: AutoClassifyEvent[], maxLines: number, maxChars: number): string {
  const lines: string[] = [];
  let n = 0;
  for (const e of events) {
    const t = (e.title ?? "").trim();
    if (!t) continue;
    lines.push(t.length > 120 ? `${t.slice(0, 117)}…` : t);
    n++;
    if (n >= maxLines) break;
  }
  let s = lines.join(" | ");
  if (s.length > maxChars) s = s.slice(0, maxChars - 1) + "…";
  return s;
}

function hasAnyLlmKey(): boolean {
  const g =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  return Boolean(g && g.length > 0) || Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "入力が不正です",
        ...(process.env.NODE_ENV !== "production" ? { details: parsed.error.flatten() } : {}),
      },
      { status: 400 },
    );
  }

  const { calendarId, calendarName, events, calendarOpening } = parsed.data;
  const opening = (calendarOpening ?? null) as CalendarOpeningSettings | null;

  const normalizedEvents: AutoClassifyEvent[] = events.map((e) => ({
    ...e,
    calendarId: e.calendarId ?? calendarId,
    calendarName: e.calendarName?.trim() || calendarName?.trim() || undefined,
  }));

  const calName = calendarName?.trim() || undefined;
  const { totals, avgDurationMinutes, priority } = aggregateCalendarAutoClassification(
    normalizedEvents,
    calName,
    opening,
  );

  const { winner, top, secondCat, second } = pickTopTwoFromTotals(totals, priority);

  let category: CalendarOpeningCategory = winner;
  let usedLlm = false;
  let ambiguousWithoutLlm = false;

  const llmEligible = shouldRefineWithLlm(top, second) && isBuiltinCategory(winner);

  if (llmEligible) {
    if (hasAnyLlmKey()) {
      const avgH =
        avgDurationMinutes != null && Number.isFinite(avgDurationMinutes)
          ? Math.round((avgDurationMinutes / 60) * 10) / 10
          : null;

      const system = `You pick one calendar-default category for a Japanese user's Google Calendar feed.
Categories (id): job_hunt, parttime, date, school, health, family, birthday, hobby, other.
Return JSON only: {"category":"<id>"}. No prose.
Bias: parttime for shift/work rosters; school for deadlines, assignments, and class-like calendars; birthday for birthdays/anniversaries; prefer school over hobby when titles look academic; hobby mainly for clear leisure (live, film) — not generic イベント on assignment calendars.
Use calendar name, event titles, and duration hints only — no user profile or outside guesses.`;

      const userJson = JSON.stringify({
        calendarName: calName ?? "",
        eventCount: normalizedEvents.length,
        avgEventHours: avgH,
        titlesSample: sampleTitles(normalizedEvents, 45, 1800),
        ruleScores: totalsToRecord(totals),
        ruleTop: winner,
        ruleSecond: secondCat,
      });

      const llm = await refineCalendarCategoryWithCheapLlm({ system, userJson });
      const llmCat = llm && isBuiltinCategory(llm.category) ? llm.category : null;
      if (llmCat) {
        category = llmCat;
        usedLlm = true;
      } else {
        ambiguousWithoutLlm = true;
      }
    } else {
      ambiguousWithoutLlm = true;
    }
  }

  return NextResponse.json({
    ok: true,
    category,
    usedLlm,
    ambiguousWithoutLlm,
    ruleBased: {
      winner,
      top,
      second,
      secondCat,
    },
    totals: totalsToRecord(totals),
    eventCount: normalizedEvents.length,
    avgDurationMinutes,
  });
}
