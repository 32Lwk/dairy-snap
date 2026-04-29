import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { imageId } = await ctx.params;
  const image = await prisma.image.findFirst({
    where: {
      id: imageId,
      entry: { userId: session.user.id },
    },
  });
  if (!image) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const storage = getObjectStorage();
  const buf = await storage.get(image.storageKey);
  if (!buf) return NextResponse.json({ error: "ファイルがありません" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { imageId } = await ctx.params;
  const image = await prisma.image.findFirst({
    where: {
      id: imageId,
      entry: { userId: session.user.id },
    },
    select: { id: true, storageKey: true },
  });
  if (!image) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  await prisma.image.delete({ where: { id: image.id } });

  const storage = getObjectStorage();
  await storage.delete(image.storageKey);

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { imageId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    rotationQuarterTurns?: unknown;
    caption?: unknown;
  };

  const patch: { rotationQuarterTurns?: number; caption?: string } = {};

  if (body.rotationQuarterTurns !== undefined) {
    const n = typeof body.rotationQuarterTurns === "number" ? body.rotationQuarterTurns : Number(body.rotationQuarterTurns);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "rotationQuarterTurns が不正です" }, { status: 400 });
    const q = ((Math.trunc(n) % 4) + 4) % 4;
    patch.rotationQuarterTurns = q;
  }

  if (body.caption !== undefined) {
    const raw = typeof body.caption === "string" ? body.caption : String(body.caption ?? "");
    patch.caption = raw.trim().slice(0, 280);
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "更新内容がありません" }, { status: 400 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, entry: { userId: session.user.id } },
    select: { id: true },
  });
  if (!image) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const updated = await prisma.image.update({
    where: { id: image.id },
    data: patch,
    select: { id: true, rotationQuarterTurns: true, caption: true },
  });

  return NextResponse.json({ image: updated });
}
