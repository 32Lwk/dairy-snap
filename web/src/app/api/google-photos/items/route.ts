import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD が必要です" }, { status: 400 });
  }

  const rows = await prisma.googlePhotoSelection.findMany({
    where: { userId: session.user.id, entryDateYmd: date },
    orderBy: [{ creationTime: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      mediaItemId: true,
      baseUrl: true,
      productUrl: true,
      mimeType: true,
      filename: true,
      width: true,
      height: true,
      creationTime: true,
      entryId: true,
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      creationTime: r.creationTime?.toISOString() ?? null,
      thumbUrl: `${r.baseUrl}=w480-h480-c`,
      displayUrl: `${r.baseUrl}=w1600-h1600`,
    })),
  });
}
