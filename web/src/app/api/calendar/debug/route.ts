import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromAt = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00+09:00`) : null;
  const toAt = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999+09:00`) : null;

  const where = {
    userId: session.user.id,
    ...(fromAt || toAt
      ? {
          startAt: {
            ...(fromAt ? { gte: fromAt } : {}),
            ...(toAt ? { lte: toAt } : {}),
          },
        }
      : {}),
  } as const;

  const [total, notCancelled, sample] = await Promise.all([
    prisma.googleCalendarEventCache.count({ where }),
    prisma.googleCalendarEventCache.count({ where: { ...where, isCancelled: false } }),
    prisma.googleCalendarEventCache.findMany({
      where: { ...where, isCancelled: false },
      orderBy: { startAt: "asc" },
      take: 10,
      select: { calendarId: true, eventId: true, title: true, startIso: true, startAt: true },
    }),
  ]);

  return NextResponse.json({ total, notCancelled, sample });
}

