import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { threadId } = await ctx.params;

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, entry: { userId: session.user.id } },
  });
  if (!thread) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  await prisma.chatThread.delete({ where: { id: threadId } });
  return NextResponse.json({ ok: true });
}
