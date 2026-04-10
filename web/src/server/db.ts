import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/** 開発時: Prisma スキーマ変更後に古い PrismaClient が global に残るとバリデーションがズレるため、更新時はバージョンを上げる */
const PRISMA_DEV_CACHE_VERSION = 4;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaDevCacheVersion?: number;
  pool?: Pool;
};

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool({ connectionString: url });
  }
  return globalForPrisma.pool;
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg(getPool()),
    log: [],
  });
}

const devCacheStale =
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prismaDevCacheVersion !== PRISMA_DEV_CACHE_VERSION;

if (devCacheStale && globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
  globalForPrisma.pool?.end();
  globalForPrisma.pool = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const client = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = client;
      globalForPrisma.prismaDevCacheVersion = PRISMA_DEV_CACHE_VERSION;
    }
    return client;
  })();
