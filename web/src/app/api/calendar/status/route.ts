import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

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
  const hasCalendarScope = scopes.includes(CALENDAR_SCOPE);

  return NextResponse.json({
    hasGoogleAccount: Boolean(account),
    hasRefreshToken: Boolean(account?.refresh_token),
    hasCalendarReadonlyScope: hasCalendarScope,
    scopes,
  });
}
