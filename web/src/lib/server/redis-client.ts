import { createClient, type RedisClientType } from "redis";

let singleton: RedisClientType | null | undefined;
let connecting: Promise<RedisClientType | null> | undefined;

/**
 * 共有 Redis。`REDIS_URL` なしは null。初回接続失敗後も null で固定。
 */
export async function getOptionalRedis(): Promise<RedisClientType | null> {
  if (singleton !== undefined) return singleton;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    singleton = null;
    return null;
  }

  connecting =
    connecting ??
    (async () => {
      const c = createClient({ url }) as RedisClientType;
      try {
        await c.connect();
        return c;
      } catch {
        try {
          await c.quit();
        } catch {
          /* ignore */
        }
        return null;
      }
    })();

  const connected = await connecting;
  singleton = connected;
  return connected;
}

/** Vitest 等 */
export function resetRedisClientForTests(): void {
  singleton = undefined;
  connecting = undefined;
}
