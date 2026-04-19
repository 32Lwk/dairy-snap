import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { applyAmPmWeatherForEntry } from "@/server/entry-weather";
import { prisma } from "@/server/db";
import { runMasMemoryDiaryConsolidation, shouldRunMemoryDiaryConsolidationOnBodyChange } from "@/server/mas-memory";

const patchSchema = z.object({
  title: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  body: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ entryId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { entryId } = await ctx.params;
  const entry = await prisma.dailyEntry.findFirst({
    where: { id: entryId, userId: session.user.id },
    include: {
      appendEvents: { orderBy: { occurredAt: "asc" } },
      entryTags: { include: { tag: true } },
      images: true,
      chatThreads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ entryId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { entryId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.dailyEntry.findFirst({
    where: { id: entryId, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const entry = await prisma.dailyEntry.update({
    where: { id: entryId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.mood !== undefined ? { mood: parsed.data.mood } : {}),
      ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
      ...(parsed.data.latitude !== undefined ? { latitude: parsed.data.latitude } : {}),
      ...(parsed.data.longitude !== undefined ? { longitude: parsed.data.longitude } : {}),
    },
  });

  const locSet =
    parsed.data.latitude != null &&
    parsed.data.longitude != null &&
    !Number.isNaN(parsed.data.latitude) &&
    !Number.isNaN(parsed.data.longitude);
  if (locSet) {
    try {
      await applyAmPmWeatherForEntry(entryId);
    } catch {
      /* 天気取得失敗でも PATCH は成功 */
    }
  }

  const refreshed = await prisma.dailyEntry.findUnique({ where: { id: entryId } });
  const finalEntry = refreshed ?? entry;

  if (
    parsed.data.body !== undefined &&
    shouldRunMemoryDiaryConsolidationOnBodyChange(existing.body, finalEntry.body)
  ) {
    after(() =>
      runMasMemoryDiaryConsolidation({
        userId: session.user.id,
        entryId: finalEntry.id,
        entryDateYmd: finalEntry.entryDateYmd,
        encryptionMode: finalEntry.encryptionMode,
        diaryBody: finalEntry.body,
      }).catch(() => {}),
    );
  }

  return NextResponse.json({ entry: finalEntry });
}
