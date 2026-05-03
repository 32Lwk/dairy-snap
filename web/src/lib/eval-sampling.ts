/** `EVAL_SAMPLE_RATE`（0〜1、未設定または1以上で常に通過）に基づくサンプリングゲート */
export function passesEvalSamplingGate(): boolean {
  const raw = process.env.EVAL_SAMPLE_RATE?.trim() ?? "1";
  const r = parseFloat(raw);
  if (!Number.isFinite(r) || r >= 1) return true;
  if (r <= 0) return false;
  return Math.random() < r;
}
