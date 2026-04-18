import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

/** 同期済み Google 予定のフルキャッシュ（eventPayload 含む） */
export async function GET(_req: Request, ctx: { params: Promise<{ cacheId: string }> }) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { cacheId } = await ctx.params;
  const id = cacheId?.trim();
  if (!id) {
    return NextResponse.json({ error: "cacheId が必要です" }, { status: 400 });
  }

  const row = await prisma.googleCalendarEventCache.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    userId: row.userId,
    calendarId: row.calendarId,
    eventId: row.eventId,
    calendarName: row.calendarName,
    calendarColorId: row.calendarColorId,
    eventColorId: row.eventColorId,
    title: row.title,
    location: row.location,
    description: row.description,
    eventPayload: row.eventPayload,
    eventSearchBlob: row.eventSearchBlob,
    startIso: row.startIso,
    endIso: row.endIso,
    fixedCategory: row.fixedCategory,
    isCancelled: row.isCancelled,
    updatedAtGcal: row.updatedAtGcal,
    updatedAt: row.updatedAt,
  });
}
