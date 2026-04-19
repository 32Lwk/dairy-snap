import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { getGoogleAccessToken } from "@/server/google-photos";

export const runtime = "nodejs";

function clampDim(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(2048, Math.max(64, Math.floor(n)));
}

/**
 * Google Photos Picker の baseUrl はブラウザからは認証ヘッダを付けられないため、
 * サーバーで Bearer を付けて取得し直す（公式ドキュメントの要件）。
 * GET /api/google-photos/preview?id={googlePhotoSelection.id}&w=480&h=480
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

  const w = clampDim(parseInt(url.searchParams.get("w") ?? "", 10), 480);
  const h = clampDim(parseInt(url.searchParams.get("h") ?? "", 10), 480);

  const row = await prisma.googlePhotoSelection.findFirst({
    where: { id, userId: session.user.id },
    select: { baseUrl: true },
  });
  const base = row?.baseUrl?.trim();
  if (!base) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(session.user.id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "認証に失敗しました" }, { status: 401 });
  }

  const mediaUrl = base.includes("=") ? base : `${base}=w${w}-h${h}-c`;

  const upstream = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "follow",
    cache: "no-store",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Google 画像の取得に失敗しました (${upstream.status})` },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  const ct = upstream.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";

  return new NextResponse(buf, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=300",
    },
  });
}
