import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import { prisma } from "@/server/db";
import { appendToDailyEntry } from "@/server/journal";

const postSchema = z.object({
  entryDateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fragment: z.string().min(1),
  mood: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (date) {
    const entry = await prisma.dailyEntry.findUnique({
      where: {
        userId_entryDateYmd: { userId: session.user.id, entryDateYmd: date },
      },
      include: {
        entryTags: { include: { tag: true } },
        images: true,
      },
    });
    return NextResponse.json({ entry });
  }

  if (from && to) {
    const entries = await prisma.dailyEntry.findMany({
      where: {
        userId: session.user.id,
        entryDateYmd: { gte: from, lte: to },
      },
      orderBy: { entryDateYmd: "asc" },
      select: {
        id: true,
        entryDateYmd: true,
        title: true,
        mood: true,
        body: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ entries });
  }

  return NextResponse.json({ error: "date または from+to を指定してください" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const entry = await appendToDailyEntry({
      userId: session.user.id,
      entryDateYmd: parsed.data.entryDateYmd,
      fragment: parsed.data.fragment,
      mood: parsed.data.mood,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗しました";
    scheduleAppLog(AppLogScope.entries, "warn", "entry_append_failed", {
      userId: session.user.id,
      entryDateYmd: parsed.data.entryDateYmd,
      err: msg.slice(0, 400),
    });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
