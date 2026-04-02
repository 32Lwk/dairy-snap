import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ error: "q を指定してください" }, { status: 400 });
  }

  const entries = await prisma.dailyEntry.findMany({
    where: {
      userId: session.user.id,
      encryptionMode: "STANDARD",
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { entryDateYmd: "desc" },
    take: 50,
    select: {
      id: true,
      entryDateYmd: true,
      title: true,
      mood: true,
      body: true,
    },
  });

  return NextResponse.json({ entries });
}
