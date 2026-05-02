import { getUserEffectiveDayContext } from "@/lib/server/user-effective-day";
import { prisma } from "@/server/db";

export const LIMITS = {
  CHAT_PER_DAY: 50,
  IMAGE_GEN_PER_DAY: 3,
  DAILY_SUMMARY_PER_DAY: 5,
  /** チャットからの設定自動適用（24h あたり、AuditLog ベースで別途上限） */
  SETTINGS_APPLY_PER_24H: 5,
  /** 趣味系: Vertex グラウンディング・allowlist GET 等の合算（目安） */
  HOBBY_EXTERNAL_FETCH_PER_DAY: 10,
} as const;

async function effectiveUsageDateYmd(userId: string): Promise<string> {
  const ctx = await getUserEffectiveDayContext(userId);
  return ctx.effectiveYmd;
}

export async function getTodayCounter(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd },
    update: {},
  });
}

export async function incrementChat(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, chatMessages: 1 },
    update: { chatMessages: { increment: 1 } },
  });
}

export async function incrementImageGen(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, imageGenerations: 1 },
    update: { imageGenerations: { increment: 1 } },
  });
}

export async function incrementDailySummary(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, dailySummaries: 1 },
    update: { dailySummaries: { increment: 1 } },
  });
}

export async function incrementOrchestratorCalls(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, orchestratorCalls: 1 },
    update: { orchestratorCalls: { increment: 1 } },
  });
}

/** 記憶サブエージェント 1 回あたり（将来の日次上限に使用） */
export async function incrementMemorySubAgentCalls(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, memorySubAgentCalls: 1 },
    update: { memorySubAgentCalls: { increment: 1 } },
  });
}

/** チャット経由で設定が成功適用されたとき（可視化・日次集計用） */
export async function incrementSettingsChange(userId: string) {
  const dateYmd = await effectiveUsageDateYmd(userId);
  return prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd, settingsChanges: 1 },
    update: { settingsChanges: { increment: 1 } },
  });
}

/**
 * 趣味の外部取得 1 回ぶん。上限超過なら allowed: false（カウントは増やさない）。
 */
export async function tryIncrementHobbyExternalFetch(userId: string): Promise<{
  allowed: boolean;
  count: number;
}> {
  const dateYmd = await effectiveUsageDateYmd(userId);
  const row = await prisma.usageCounter.upsert({
    where: { userId_dateYmd: { userId, dateYmd } },
    create: { userId, dateYmd },
    update: {},
  });
  if (row.hobbyExternalFetches >= LIMITS.HOBBY_EXTERNAL_FETCH_PER_DAY) {
    return { allowed: false, count: row.hobbyExternalFetches };
  }
  const next = await prisma.usageCounter.update({
    where: { userId_dateYmd: { userId, dateYmd } },
    data: { hobbyExternalFetches: { increment: 1 } },
  });
  return { allowed: true, count: next.hobbyExternalFetches };
}
