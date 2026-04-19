import { prisma } from "@/server/db";

/** Prisma include: latest chat thread and messages (return shape for `upsertDailyEntryForYmd`). */
const dailyEntryLatestThreadInclude = {
  chatThreads: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    include: { messages: { orderBy: { createdAt: "asc" as const } } },
  },
} as const;

function isPrismaUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}

/**
 * 指定日（`YYYY-MM-DD`）の日記行を存在させる。無ければ空本文で作成する。
 * 同日に並行リクエストが来て upsert が P2002 になる場合は既存行を返す。
 */
export async function upsertDailyEntryForYmd(userId: string, entryDateYmd: string) {
  const where = {
    userId_entryDateYmd: { userId, entryDateYmd },
  };

  try {
    return await prisma.dailyEntry.upsert({
      where,
      create: {
        userId,
        entryDateYmd,
        body: "",
      },
      update: {},
      include: dailyEntryLatestThreadInclude,
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      return prisma.dailyEntry.findUniqueOrThrow({
        where,
        include: dailyEntryLatestThreadInclude,
      });
    }
    throw e;
  }
}
