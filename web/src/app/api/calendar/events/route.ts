import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import { fetchCalendarEventsForUser } from "@/server/calendar";

export const runtime = "nodejs";

/** 未来30日の予定（タイトル・開始/終了・場所・説明） */
export async function GET(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const url = new URL(req.url);
  const forceSync = url.searchParams.get("forceSync") === "1";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
  const calendarIdRaw = url.searchParams.get("calendarId");
  const calendarId =
    typeof calendarIdRaw === "string" && calendarIdRaw.trim().length > 0
      ? calendarIdRaw.trim()
      : undefined;

  const full = url.searchParams.get("full") === "1";
  const deepSync = url.searchParams.get("deepSync") === "1";
  const deepPastRaw = url.searchParams.get("deepPastDays");
  const deepPastDays =
    deepSync && calendarId && deepPastRaw && /^\d+$/.test(deepPastRaw)
      ? Number(deepPastRaw)
      : deepSync && calendarId
        ? 730
        : undefined;

  const result = await fetchCalendarEventsForUser(session.user.id, {
    forceSync,
    fromYmd: from ?? undefined,
    toYmd: to ?? undefined,
    limit,
    calendarId,
    includeEventPayload: full,
    ...(deepSync && calendarId ? { deepSync: true, deepPastDays } : {}),
  });
  if (!result.ok) {
    const detail = result.detail ?? result.reason;
    scheduleAppLog(AppLogScope.calendar, "warn", "calendar_events_fetch_failed", {
      userId: session.user.id,
      reason: result.reason,
      detailSnippet: typeof detail === "string" ? detail.slice(0, 300) : undefined,
      fromYmd: from ?? null,
      toYmd: to ?? null,
      forceSync,
    });
    const detailLooksInternal =
      typeof detail === "string" &&
      (detail.includes("Invalid `prisma.") ||
        detail.includes("prisma.googleCalendarEventCache") ||
        detail.includes("PrismaClient") ||
        detail.includes("findMany() invocation"));
    if (result.reason === "oauth_not_configured") {
      return NextResponse.json({ error: "Google OAuth が未設定です", reason: result.reason }, { status: 503 });
    }
    if (result.reason === "no_google_account") {
      return NextResponse.json({ error: "Google アカウントが見つかりません", reason: result.reason }, { status: 401 });
    }
    if (result.reason === "db_schema_out_of_sync") {
      return NextResponse.json(
        {
          error:
            "カレンダー機能の更新が反映されていません（DB更新が必要です）。開発環境では `npx prisma migrate dev` を実行してから再試行してください。",
          reason: result.reason,
          hint: "それでも直らない場合は、いったんページを更新してから「強制同期して再試行」を押してください。",
        },
        { status: 503 },
      );
    }
    if (result.reason === "no_refresh_token" || result.reason === "invalid_grant") {
      return NextResponse.json(
        {
          error: detail,
          reason: result.reason,
          hint: "設定画面の「Google を再連携（カレンダー）」を実行してください。",
        },
        { status: 401 },
      );
    }
    if (detailLooksInternal) {
      return NextResponse.json(
        {
          error:
            "カレンダー予定の読み込みに失敗しました。しばらくしてから「更新」を押して再試行してください。続く場合は設定で Google を再連携してください。",
          reason: result.reason,
          hint: "このエラーが続く場合は、設定 → Google を再連携（カレンダー）を試してください。",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: detail, reason: result.reason },
      { status: result.reason === "calendar_api_error" ? 502 : 500 },
    );
  }

  return NextResponse.json({ events: result.events });
}
