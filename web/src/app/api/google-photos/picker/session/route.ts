import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import {
  createGooglePhotosPickerSession,
  getGooglePhotosPickerSession,
  importGooglePhotosFromSession,
} from "@/server/google-photos";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

function isYmd(v: string | null): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export async function POST(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const body = (await req.json().catch(() => ({}))) as { entryDateYmd?: string; entryId?: string };
  const entryDateYmd = typeof body.entryDateYmd === "string" ? body.entryDateYmd : "";
  if (!isYmd(entryDateYmd)) {
    return NextResponse.json({ error: "entryDateYmd は YYYY-MM-DD 形式で指定してください" }, { status: 400 });
  }

  if (body.entryId) {
    const entry = await prisma.dailyEntry.findFirst({ where: { id: body.entryId, userId: session.user.id }, select: { id: true } });
    if (!entry) return NextResponse.json({ error: "entryId が不正です" }, { status: 404 });
  }

  try {
    const s = await createGooglePhotosPickerSession(session.user.id);
    return NextResponse.json({
      sessionId: s.id,
      pickerUri: s.pickerUri,
      pollIntervalSeconds: Number(s.pollingConfig?.pollInterval?.replace("s", "") ?? "3") || 3,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "セッション作成に失敗しました" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  const importNow = url.searchParams.get("import") === "1";
  const entryDateYmd = url.searchParams.get("entryDateYmd");
  const entryId = url.searchParams.get("entryId")?.trim() || undefined;

  if (!sessionId) return NextResponse.json({ error: "sessionId が必要です" }, { status: 400 });
  if (importNow && !isYmd(entryDateYmd)) {
    return NextResponse.json({ error: "import=1 の場合、entryDateYmd が必要です" }, { status: 400 });
  }

  try {
    const s = await getGooglePhotosPickerSession(session.user.id, sessionId);
    if (!importNow) {
      return NextResponse.json({
        sessionId,
        mediaItemsSet: Boolean(s.mediaItemsSet),
        pollIntervalSeconds: Number(s.pollingConfig?.pollInterval?.replace("s", "") ?? "3") || 3,
      });
    }

    if (!s.mediaItemsSet || !entryDateYmd) {
      return NextResponse.json({ sessionId, mediaItemsSet: false, imported: 0, total: 0 });
    }

    if (entryId) {
      const entry = await prisma.dailyEntry.findFirst({ where: { id: entryId, userId: session.user.id }, select: { id: true } });
      if (!entry) return NextResponse.json({ error: "entryId が不正です" }, { status: 404 });
    }

    const imported = await importGooglePhotosFromSession({
      userId: session.user.id,
      sessionId,
      entryDateYmd,
      entryId,
    });

    return NextResponse.json({
      sessionId,
      mediaItemsSet: true,
      imported: imported.imported,
      total: imported.total,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "セッション確認に失敗しました" }, { status: 400 });
  }
}
