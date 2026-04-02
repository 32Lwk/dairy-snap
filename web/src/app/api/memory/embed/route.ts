import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { upsertEntryEmbedding } from "@/server/embeddings";

export const runtime = "nodejs";

const bodySchema = z.object({
  entryId: z.string().min(1),
});

/** エントリ本文のベクトルを再計算して embeddings に保存（STANDARD のみ） */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: parsed.data.entryId, userId: session.user.id },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (entry.encryptionMode !== "STANDARD") {
    return NextResponse.json(
      { error: "暗号化エントリはベクトル化できません" },
      { status: 400 },
    );
  }

  try {
    await upsertEntryEmbedding(session.user.id, entry.id, entry.body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "embedding に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
