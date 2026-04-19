import { createHash } from "node:crypto";
import { OPENING_PENDING_MODEL } from "@/lib/opening-pending";
import { prisma } from "@/server/db";

const STALE_PENDING_MS = 10 * 60 * 1000;

export type OpeningThreadClaim =
  | { kind: "skip"; threadId: string }
  | { kind: "in_progress"; threadId: string }
  | { kind: "proceed"; threadId: string; assistantMessageId: string };

function advisoryKeysForEntry(entryId: string): [number, number] {
  const buf = createHash("sha256").update(entryId).digest();
  let k1 = buf.readInt32BE(0);
  let k2 = buf.readInt32BE(4);
  if (k1 === 0) k1 = 1;
  if (k2 === 0) k2 = 1;
  return [k1, k2];
}

/** Serialize concurrent opening requests; insert one placeholder if the thread is still empty. */
export async function claimThreadForOpening(entryId: string): Promise<OpeningThreadClaim> {
  return prisma.$transaction(async (tx) => {
    const [k1, k2] = advisoryKeysForEntry(entryId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${k1}::integer, ${k2}::integer)`;

    let thread = await tx.chatThread.findFirst({
      where: { entryId },
      orderBy: { updatedAt: "desc" },
    });
    if (!thread) {
      thread = await tx.chatThread.create({ data: { entryId } });
    }

    const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
    await tx.chatMessage.deleteMany({
      where: {
        threadId: thread.id,
        model: OPENING_PENDING_MODEL,
        createdAt: { lt: staleBefore },
      },
    });

    const existingPending = await tx.chatMessage.findFirst({
      where: { threadId: thread.id, model: OPENING_PENDING_MODEL },
    });
    if (existingPending) {
      return { kind: "in_progress", threadId: thread.id };
    }

    const realCount = await tx.chatMessage.count({
      where: { threadId: thread.id, NOT: { model: OPENING_PENDING_MODEL } },
    });
    if (realCount > 0) {
      return { kind: "skip", threadId: thread.id };
    }

    const msg = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: "",
        model: OPENING_PENDING_MODEL,
        agentName: "orchestrator",
      },
    });
    return { kind: "proceed", threadId: thread.id, assistantMessageId: msg.id };
  });
}
