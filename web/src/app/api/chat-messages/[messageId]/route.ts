import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  content: z.string().min(1).max(16000),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { messageId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const existing = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      thread: { entry: { userId: session.user.id } },
    },
  });
  if (!existing) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (existing.role !== "user") {
    return NextResponse.json({ error: "ユーザー発言のみ編集できます" }, { status: 400 });
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: parsed.data.content },
  });

  return NextResponse.json({ message: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { messageId } = await ctx.params;

  const existing = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      thread: { entry: { userId: session.user.id } },
    },
  });
  if (!existing) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  await prisma.chatMessage.delete({ where: { id: messageId } });
  return NextResponse.json({ ok: true });
}
