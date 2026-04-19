import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDAR_EVENTS_WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const runtime = "nodejs";

/** カレンダー連携の診断用（本文は含まない） */
export async function GET() {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { refresh_token: true, scope: true },
  });

  const scopes = account?.scope?.split(/\s+/).filter(Boolean) ?? [];

  return NextResponse.json({
    hasGoogleAccount: Boolean(account),
    hasRefreshToken: Boolean(account?.refresh_token),
    hasCalendarReadonlyScope: scopes.includes(CALENDAR_READONLY_SCOPE),
    hasCalendarEventsWriteScope: scopes.includes(CALENDAR_EVENTS_WRITE_SCOPE),
    scopes,
  });
}
