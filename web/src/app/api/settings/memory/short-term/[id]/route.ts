import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  bullets: z.array(z.string().max(400)).max(20),
  salience: z.number().min(0).max(1).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if ("response" in session) return session.response;
  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const row = await prisma.memoryShortTerm.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.memoryShortTerm.update({
    where: { id },
    data: {
      bullets: parsed.data.bullets,
      ...(parsed.data.salience != null ? { salience: parsed.data.salience } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: row.entryId,
      action: "memory_short_term_user_patch",
      metadata: { memoryId: id },
    },
  });

  return NextResponse.json({ ok: true, row: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if ("response" in session) return session.response;
  const { id } = await ctx.params;

  const row = await prisma.memoryShortTerm.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.memoryShortTerm.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: row.entryId,
      action: "memory_short_term_user_delete",
      metadata: { memoryId: id },
    },
  });

  return NextResponse.json({ ok: true });
}
