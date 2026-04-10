import { prisma } from "@/server/db";

const todayPageInclude = {
  chatThreads: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    include: { messages: { orderBy: { createdAt: "asc" as const } } },
  },
} as const;

function isPrismaUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}

/** 同日エントリの並行作成で upsert が P2002 になる場合にフォローする */
export async function upsertDailyEntryForTodayPage(userId: string, entryDateYmd: string) {
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
      include: todayPageInclude,
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      return prisma.dailyEntry.findUniqueOrThrow({
        where,
        include: todayPageInclude,
      });
    }
    throw e;
  }
}
