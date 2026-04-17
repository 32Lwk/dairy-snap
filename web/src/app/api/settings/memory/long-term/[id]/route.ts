import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

const patchSchema = z
  .object({
    bullets: z.array(z.string().max(400)).max(20).optional(),
    impactScore: z.number().min(0).max(100).optional(),
  })
  .refine((b) => b.bullets != null || b.impactScore != null, { message: "bullets or impactScore required" });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if ("response" in session) return session.response;
  const { id } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const row = await prisma.memoryLongTerm.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const prevImpact = row.impactScore;
  const nextBullets =
    parsed.data.bullets ??
    (Array.isArray(row.bullets) ? (row.bullets as string[]) : []);
  const updated = await prisma.memoryLongTerm.update({
    where: { id },
    data: {
      bullets: nextBullets,
      ...(parsed.data.impactScore != null ? { impactScore: parsed.data.impactScore } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: row.sourceEntryId,
      action: "memory_long_term_user_patch",
      metadata: {
        memoryId: id,
        prevImpact,
        nextImpact: updated.impactScore,
      },
    },
  });

  return NextResponse.json({ ok: true, row: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if ("response" in session) return session.response;
  const { id } = await ctx.params;

  const row = await prisma.memoryLongTerm.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.memoryLongTerm.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: row.sourceEntryId,
      action: "memory_long_term_user_delete",
      metadata: { memoryId: id },
    },
  });

  return NextResponse.json({ ok: true });
}
