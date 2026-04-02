import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { applyAmPmWeatherForEntry } from "@/server/entry-weather";

export const runtime = "nodejs";

const postSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

function isPair(n: unknown): n is number {
  return typeof n === "number" && !Number.isNaN(n);
}

/** リクエストで座標があれば保存 → その日の午前・午後天気を Open-Meteo で取得して weatherJson に保存 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ entryId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { entryId } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: entryId, userId: session.user.id },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const reqLat = parsed.data.latitude;
  const reqLon = parsed.data.longitude;
  const hasReqPair =
    reqLat !== undefined &&
    reqLon !== undefined &&
    isPair(reqLat) &&
    isPair(reqLon);

  try {
    if (hasReqPair) {
      await prisma.dailyEntry.update({
        where: { id: entryId },
        data: { latitude: reqLat, longitude: reqLon },
      });
    }

    await applyAmPmWeatherForEntry(entryId);

    const updated = await prisma.dailyEntry.findUnique({ where: { id: entryId } });
    return NextResponse.json({ entry: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "天気の取得に失敗しました";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
