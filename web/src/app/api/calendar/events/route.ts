import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
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

  const result = await fetchCalendarEventsForUser(session.user.id, {
    forceSync,
    fromYmd: from ?? undefined,
    toYmd: to ?? undefined,
    limit,
  });
  if (!result.ok) {
    const detail = result.detail ?? result.reason;
    if (result.reason === "oauth_not_configured") {
      return NextResponse.json({ error: "Google OAuth が未設定です", reason: result.reason }, { status: 503 });
    }
    if (result.reason === "no_google_account") {
      return NextResponse.json({ error: "Google アカウントが見つかりません", reason: result.reason }, { status: 401 });
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
    return NextResponse.json(
      { error: detail, reason: result.reason },
      { status: result.reason === "calendar_api_error" ? 502 : 500 },
    );
  }

  return NextResponse.json({ events: result.events });
}
