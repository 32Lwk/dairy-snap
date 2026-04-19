import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { sha256Hex } from "@/lib/crypto/sha256";
import { extFromMime, MAX_IMAGES_PER_ENTRY, MAX_TOTAL_IMAGE_BYTES_PER_ENTRY } from "@/lib/entry-image-limits";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ entryId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { entryId } = await ctx.params;
  const entry = await prisma.dailyEntry.findFirst({
    where: { id: entryId, userId: session.user.id },
    include: { images: true },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (entry.images.length >= MAX_IMAGES_PER_ENTRY) {
    return NextResponse.json({ error: "1日あたり画像は最大10枚です" }, { status: 400 });
  }

  const totalBytes = entry.images.reduce((s, i) => s + i.byteSize, 0);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file が必要です" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const maxSingle = MAX_TOTAL_IMAGE_BYTES_PER_ENTRY - totalBytes;
  if (buf.length > maxSingle) {
    return NextResponse.json(
      { error: `合計50MB以内にしてください（残り約 ${Math.max(0, Math.floor(maxSingle / 1024))} KB）` },
      { status: 400 },
    );
  }

  const mime = file.type || "application/octet-stream";
  const ext = extFromMime(mime);
  const id = randomUUID();
  const storageKey = `${session.user.id}/${entryId}/${id}.${ext}`;
  const hash = sha256Hex(buf);

  const storage = getObjectStorage();
  await storage.put({ key: storageKey, body: buf, contentType: mime });

  const image = await prisma.image.create({
    data: {
      entryId: entry.id,
      kind: "UPLOADED",
      storageKey,
      mimeType: mime,
      byteSize: buf.length,
      sha256: hash,
    },
  });

  return NextResponse.json({ image });
}
