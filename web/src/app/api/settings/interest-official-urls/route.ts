import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireResolvedSession } from "@/lib/api/require-session";
import {
  normalizeUrlForFetch,
  urlHostAllowed,
} from "@/lib/safe-allowlisted-fetch";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const JSON_NO_CACHE = {
  headers: {
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Vary: "Cookie",
  },
} as const;

const MAX_ROWS = 40;

const postSchema = z.object({
  pickId: z.string().min(3).max(160),
  url: z.string().min(8).max(2048),
});

export async function GET() {
  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const rows = await prisma.userInterestOfficialUrl.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, pickId: true, url: true, updatedAt: true },
  });

  return NextResponse.json({ items: rows }, JSON_NO_CACHE);
}

export async function POST(req: NextRequest) {
  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const u = normalizeUrlForFetch(parsed.data.url);
  if (!u || !urlHostAllowed(u)) {
    return NextResponse.json({ error: "許可された https URL のみ登録できます" }, { status: 400 });
  }

  const count = await prisma.userInterestOfficialUrl.count({
    where: { userId: session.userId },
  });
  if (count >= MAX_ROWS) {
    return NextResponse.json({ error: "登録上限に達しています" }, { status: 400 });
  }

  const row = await prisma.userInterestOfficialUrl.create({
    data: {
      userId: session.userId,
      pickId: parsed.data.pickId.trim(),
      url: u.toString(),
    },
    select: { id: true, pickId: true, url: true, updatedAt: true },
  });

  return NextResponse.json({ item: row }, JSON_NO_CACHE);
}

export async function DELETE(req: NextRequest) {
  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id が必要です" }, { status: 400 });
  }

  await prisma.userInterestOfficialUrl.deleteMany({
    where: { userId: session.userId, id },
  });

  return NextResponse.json({ ok: true }, JSON_NO_CACHE);
}
