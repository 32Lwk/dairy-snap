import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

/**
 * カレンダー分類編集用の候補（DBキャッシュ由来）
 * - calendarId / calendarName
 * - colorId（イベント色 or カレンダー色）
 */
export async function GET() {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const rows = await prisma.googleCalendarEventCache.findMany({
    where: { userId: session.user.id, isCancelled: false },
    orderBy: { updatedAt: "desc" },
    take: 2000,
    select: {
      calendarId: true,
      calendarName: true,
      calendarColorId: true,
      eventColorId: true,
    },
  });

  const calById = new Map<string, { calendarId: string; calendarName: string; calendarColorId: string }>();
  const colorIds = new Set<string>();
  for (const r of rows) {
    const calendarName = r.calendarName ?? r.calendarId;
    const calendarColorId = r.calendarColorId ?? "";
    const eventColorId = r.eventColorId ?? "";
    if (!calById.has(r.calendarId)) {
      calById.set(r.calendarId, { calendarId: r.calendarId, calendarName, calendarColorId });
    }
    const effective = eventColorId || calendarColorId;
    if (effective) colorIds.add(effective);
  }

  return NextResponse.json({
    calendars: Array.from(calById.values()).sort((a, b) => a.calendarName.localeCompare(b.calendarName)),
    colorIds: Array.from(colorIds.values()).sort(),
  });
}

