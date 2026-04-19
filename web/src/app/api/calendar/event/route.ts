import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import {
  type CalendarEventInsertInput,
  type CalendarEventPatchInput,
  insertGoogleCalendarEventForUser,
  patchGoogleCalendarEventForUser,
} from "@/server/calendar";

export const runtime = "nodejs";

function readString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readBool(v: unknown): boolean {
  return v === true;
}

/** Google Calendar 上の既存予定を更新します（calendar.events スコープが必要）。 */
export async function PATCH(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON が不正です" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  const input: CalendarEventPatchInput = {
    calendarId: readString(o.calendarId),
    eventId: readString(o.eventId),
    summary: readString(o.summary),
    description: readString(o.description),
    location: readString(o.location),
    allDay: readBool(o.allDay),
    allDayStartYmd: readString(o.allDayStartYmd),
    allDayEndInclusiveYmd: readString(o.allDayEndInclusiveYmd),
    startLocal: readString(o.startLocal),
    endLocal: readString(o.endLocal),
  };

  const result = await patchGoogleCalendarEventForUser(session.user.id, input);
  if (!result.ok) {
    const status =
      result.reason === "validation_error"
        ? 400
        : result.reason === "no_write_scope"
          ? 403
          : result.reason === "not_found"
            ? 404
            : result.reason === "no_google_account"
              ? 401
              : result.reason === "no_refresh_token" || result.reason === "invalid_grant"
                ? 401
                : result.reason === "oauth_not_configured"
                  ? 503
                  : 502;
    return NextResponse.json(
      { error: result.detail ?? "更新に失敗しました", reason: result.reason },
      { status },
    );
  }

  return NextResponse.json({ ok: true, event: result.event });
}

/** Google Calendar に予定を追加します（calendar.events スコープが必要）。 */
export async function POST(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON が不正です" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  const input: CalendarEventInsertInput = {
    calendarId: readString(o.calendarId),
    summary: readString(o.summary),
    description: readString(o.description),
    location: readString(o.location),
    allDay: readBool(o.allDay),
    allDayStartYmd: readString(o.allDayStartYmd),
    allDayEndInclusiveYmd: readString(o.allDayEndInclusiveYmd),
    startLocal: readString(o.startLocal),
    endLocal: readString(o.endLocal),
  };

  const result = await insertGoogleCalendarEventForUser(session.user.id, input);
  if (!result.ok) {
    const status =
      result.reason === "validation_error"
        ? 400
        : result.reason === "no_write_scope"
          ? 403
          : result.reason === "not_found"
            ? 404
            : result.reason === "no_google_account"
              ? 401
              : result.reason === "no_refresh_token" || result.reason === "invalid_grant"
                ? 401
                : result.reason === "oauth_not_configured"
                  ? 503
                  : 502;
    return NextResponse.json(
      { error: result.detail ?? "作成に失敗しました", reason: result.reason },
      { status },
    );
  }

  return NextResponse.json({ ok: true, event: result.event });
}
