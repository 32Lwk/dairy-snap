/**
 * クライアント送信の ISO 時刻をオーケストレーターの「壁時計」に使うか判定する。
 * サーバー時刻から大きく外れた値は無視（誤送信・改ざんの緩いガード）。
 */
const MAX_ABS_SKEW_MS = 12 * 60 * 60 * 1000; // 12 時間

export function resolveOrchestratorClockNow(serverNow: Date, clientIso?: string | null): Date {
  if (clientIso == null || !String(clientIso).trim()) return serverNow;
  const client = new Date(String(clientIso).trim());
  if (Number.isNaN(client.getTime())) return serverNow;
  if (Math.abs(client.getTime() - serverNow.getTime()) > MAX_ABS_SKEW_MS) return serverNow;
  return client;
}
