/**
 * アカウント引き継ぎのエクスポート回数制限。
 * `REDIS_URL` があるときは Redis で共有カウンタ、無い／失敗時はプロセス内 Map。
 */

import { getOptionalRedis } from "@/lib/server/redis-client";

type Window = { startedAt: number; count: number };

const exportWindows = new Map<string, Window>();

const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const EXPORT_MAX_PER_WINDOW = 3;

export type ExportRateCheck =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number };

function checkAndConsumeExportRateInMemory(userId: string): ExportRateCheck {
  const now = Date.now();
  const cur = exportWindows.get(userId);
  if (!cur || now - cur.startedAt >= EXPORT_WINDOW_MS) {
    exportWindows.set(userId, { startedAt: now, count: 1 });
    return {
      ok: true,
      remaining: EXPORT_MAX_PER_WINDOW - 1,
      resetAt: now + EXPORT_WINDOW_MS,
    };
  }
  if (cur.count >= EXPORT_MAX_PER_WINDOW) {
    return {
      ok: false,
      remaining: 0,
      resetAt: cur.startedAt + EXPORT_WINDOW_MS,
    };
  }
  cur.count += 1;
  return {
    ok: true,
    remaining: EXPORT_MAX_PER_WINDOW - cur.count,
    resetAt: cur.startedAt + EXPORT_WINDOW_MS,
  };
}

export async function checkAndConsumeExportRate(userId: string): Promise<ExportRateCheck> {
  const r = await getOptionalRedis();
  if (r) {
    const key = `account_export_rate:v1:${userId}`;
    try {
      const n = await r.incr(key);
      if (n === 1) {
        await r.expire(key, Math.ceil(EXPORT_WINDOW_MS / 1000));
      }
      const ttlSec = await r.ttl(key);
      const resetAt = Date.now() + (ttlSec > 0 ? ttlSec * 1000 : EXPORT_WINDOW_MS);
      if (n > EXPORT_MAX_PER_WINDOW) {
        return { ok: false, remaining: 0, resetAt };
      }
      return { ok: true, remaining: EXPORT_MAX_PER_WINDOW - n, resetAt };
    } catch {
      /* fall through */
    }
  }
  return checkAndConsumeExportRateInMemory(userId);
}
