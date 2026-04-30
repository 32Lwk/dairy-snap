/**
 * アカウント引き継ぎ機能のレート制限（in-memory）。
 * 単一インスタンス前提。多インスタンス化時は外部ストア（Redis 等）に置き換える。
 */

type Window = { startedAt: number; count: number };

const exportWindows = new Map<string, Window>();

const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const EXPORT_MAX_PER_WINDOW = 3;

export type ExportRateCheck =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number };

export function checkAndConsumeExportRate(userId: string): ExportRateCheck {
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
