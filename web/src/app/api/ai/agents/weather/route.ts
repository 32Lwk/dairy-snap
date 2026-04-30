import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { getWeatherContext } from "@/server/agents/weather-tool";

export const runtime = "nodejs";
export const maxDuration = 15;

const bodySchema = z.object({
  entryId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: parsed.data.entryId, userId: session.user.id },
    select: { entryDateYmd: true },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const ctx = await getWeatherContext(session.user.id, parsed.data.entryId, entry.entryDateYmd);
  return NextResponse.json(ctx);
}
