import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

const byCalendarSchema = z.object({
  mode: z.literal("by_calendar"),
  calendarId: z.string().min(1).max(512),
  category: z.string().min(1).max(64),
});

const byTitleSchema = z.object({
  mode: z.literal("by_title"),
  calendarId: z.string().min(1).max(512),
  category: z.string().min(1).max(64),
  titleIncludes: z.string().min(1).max(80),
});

const byEventSchema = z.object({
  mode: z.literal("by_event"),
  calendarId: z.string().min(1).max(512),
  eventId: z.string().min(1).max(512),
  category: z.string().min(1).max(64).nullable(),
});

/** タイトル完全一致（このカレンダー内）。category が null なら固定解除 */
const byExactTitleSchema = z.object({
  mode: z.literal("by_exact_title"),
  calendarId: z.string().min(1).max(512),
  title: z.string().max(1024),
  category: z.string().min(1).max(64).nullable(),
});

const bodySchema = z.discriminatedUnion("mode", [
  byCalendarSchema,
  byTitleSchema,
  byEventSchema,
  byExactTitleSchema,
]);

export async function POST(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.mode === "by_event") {
    const { calendarId, eventId, category } = parsed.data;
    const updated = await prisma.googleCalendarEventCache.updateMany({
      where: { userId: session.user.id, calendarId, eventId },
      data: { fixedCategory: category ?? null },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "calendar_event_fixed_category_set",
        metadata: { calendarId, eventId, category, count: updated.count },
      },
    });
    return NextResponse.json({ ok: true, updated: updated.count });
  }

  if (parsed.data.mode === "by_exact_title") {
    const { calendarId, title, category } = parsed.data;
    const r = await prisma.googleCalendarEventCache.updateMany({
      where: {
        userId: session.user.id,
        calendarId,
        isCancelled: false,
        title,
      },
      data: { fixedCategory: category ?? null },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "calendar_event_fixed_category_apply_by_exact_title",
        metadata: { calendarId, title, category, count: r.count },
      },
    });
    return NextResponse.json({ ok: true, updated: r.count });
  }

  if (parsed.data.mode === "by_title") {
    const { calendarId, category, titleIncludes } = parsed.data;
    const r = await prisma.googleCalendarEventCache.updateMany({
      where: {
        userId: session.user.id,
        calendarId,
        isCancelled: false,
        title: { contains: titleIncludes, mode: "insensitive" },
      },
      data: { fixedCategory: category },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "calendar_event_fixed_category_apply_by_title",
        metadata: { calendarId, category, titleIncludes, count: r.count },
      },
    });
    return NextResponse.json({ ok: true, updated: r.count });
  }

  // by_calendar: apply to all cached events in the calendar
  if (parsed.data.mode === "by_calendar") {
    const { calendarId, category } = parsed.data;
    const r = await prisma.googleCalendarEventCache.updateMany({
      where: { userId: session.user.id, calendarId, isCancelled: false },
      data: { fixedCategory: category },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "calendar_event_fixed_category_apply",
        metadata: { calendarId, category, count: r.count },
      },
    });
    return NextResponse.json({ ok: true, updated: r.count });
  }

  return NextResponse.json({ ok: true, updated: 0 });
}

