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
