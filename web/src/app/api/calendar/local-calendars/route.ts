import {
  formatAppLocalCalendarDisplayName,
  isAppLocalCalendarId,
  stripAppLocalCalendarIdToken,
  toAppLocalCalendarIdToken,
} from "@/lib/app-local-calendar-id";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import {
  createAppLocalCalendar,
  deleteAppLocalCalendar,
  listAppLocalCalendarsForUser,
  renameAppLocalCalendar,
} from "@/server/app-local-calendar";

export const runtime = "nodejs";

/** アプリ内のみのカレンダー一覧 */
export async function GET() {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const rows = await listAppLocalCalendarsForUser(session.user.id);
  return NextResponse.json({
    calendars: rows.map((r) => ({
      calendarId: toAppLocalCalendarIdToken(r.id),
      name: r.name,
      displayName: formatAppLocalCalendarDisplayName(r.name),
    })),
  });
}

/** アプリ内のみ（Google に同期しない）カレンダーを追加 */
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
  const name = typeof (body as { name?: unknown }).name === "string" ? (body as { name: string }).name : "";
  const trimmed = name.normalize("NFKC").trim();

  const result = await createAppLocalCalendar(session.user.id, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    calendar: {
      calendarId: toAppLocalCalendarIdToken(result.id),
      name: trimmed,
      calendarName: formatAppLocalCalendarDisplayName(trimmed),
    },
  });
}

/** 名前変更 */
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
  const calendarId = typeof o.calendarId === "string" ? o.calendarId : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!isAppLocalCalendarId(calendarId)) {
    return NextResponse.json({ error: "アプリ内カレンダーIDが不正です" }, { status: 400 });
  }
  const raw = stripAppLocalCalendarIdToken(calendarId);
  const result = await renameAppLocalCalendar(session.user.id, raw, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "カレンダーが見つかりません" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true });
}

/** 削除（紐づく予定は DB 上カスケード削除） */
export async function DELETE(req: Request) {
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
  const calendarId = typeof (body as { calendarId?: unknown }).calendarId === "string" ? (body as { calendarId: string }).calendarId : "";
  if (!isAppLocalCalendarId(calendarId)) {
    return NextResponse.json({ error: "アプリ内カレンダーIDが不正です" }, { status: 400 });
  }
  const raw = stripAppLocalCalendarIdToken(calendarId);
  const result = await deleteAppLocalCalendar(session.user.id, raw);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "カレンダーが見つかりません" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true });
}
