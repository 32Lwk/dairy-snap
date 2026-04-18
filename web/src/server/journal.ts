import { prisma } from "@/server/db";
import { formatHmTokyo } from "@/lib/time/tokyo";
import { upsertEntryEmbedding, upsertTextEmbedding } from "@/server/embeddings";

function buildAppendedBody(prevBody: string, fragment: string, at: Date): string {
  const heading = `## ${formatHmTokyo(at)}`;
  const trimmed = fragment.trim();
  if (!trimmed) return prevBody;
  if (!prevBody.trim()) {
    return `${heading}\n\n${trimmed}`;
  }
  return `${prevBody.trimEnd()}\n\n${heading}\n\n${trimmed}`;
}

export async function appendToDailyEntry(params: {
  userId: string;
  entryDateYmd: string;
  fragment: string;
  occurredAt?: Date;
  mood?: string | null;
}) {
  const occurredAt = params.occurredAt ?? new Date();
  const fragment = params.fragment.trim();
  if (!fragment) {
    throw new Error("本文が空です");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.dailyEntry.findUnique({
      where: {
        userId_entryDateYmd: {
          userId: params.userId,
          entryDateYmd: params.entryDateYmd,
        },
      },
    });

    const nextBody = buildAppendedBody(existing?.body ?? "", fragment, occurredAt);

    const entry = await tx.dailyEntry.upsert({
      where: {
        userId_entryDateYmd: {
          userId: params.userId,
          entryDateYmd: params.entryDateYmd,
        },
      },
      create: {
        userId: params.userId,
        entryDateYmd: params.entryDateYmd,
        body: nextBody,
        mood: params.mood ?? undefined,
      },
      update: {
        body: nextBody,
        ...(params.mood != null && params.mood !== "" ? { mood: params.mood } : {}),
      },
    });

    const appendEv = await tx.entryAppendEvent.create({
      data: {
        entryId: entry.id,
        occurredAt,
        fragment,
      },
    });

    return { entry, appendEventId: appendEv.id };
  }).then(async ({ entry, appendEventId }) => {
    if (entry.encryptionMode === "STANDARD" && process.env.OPENAI_API_KEY) {
      void upsertTextEmbedding(params.userId, "ENTRY_APPEND", appendEventId, fragment).catch(() => {});
      void upsertEntryEmbedding(params.userId, entry.id, entry.body).catch(() => {});
    }
    return entry;
  });
}
