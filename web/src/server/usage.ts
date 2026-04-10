import { formatYmdTokyo } from "@/lib/time/tokyo";
import { prisma } from "@/server/db";

export const LIMITS = {
  CHAT_PER_DAY: 50,
  IMAGE_GEN_PER_DAY: 3,
  DAILY_SUMMARY_PER_DAY: 5,
} as const;

export async function getTodayCounter(userId: string) {
  const dateYmd = formatYmdTokyo();
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd },
    update: {},
  });
}

export async function incrementChat(userId: string) {
  const dateYmd = formatYmdTokyo();
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, chatMessages: 1 },
    update: { chatMessages: { increment: 1 } },
  });
}

export async function incrementImageGen(userId: string) {
  const dateYmd = formatYmdTokyo();
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, imageGenerations: 1 },
    update: { imageGenerations: { increment: 1 } },
  });
}

export async function incrementDailySummary(userId: string) {
  const dateYmd = formatYmdTokyo();
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, dailySummaries: 1 },
    update: { dailySummaries: { increment: 1 } },
  });
}

export async function incrementOrchestratorCalls(userId: string) {
  const dateYmd = formatYmdTokyo();
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, orchestratorCalls: 1 },
    update: { orchestratorCalls: { increment: 1 } },
  });
}
