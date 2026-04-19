/** Defaults from security plan (hybrid sampling). */

export const SECURITY_REVIEW_ALWAYS_LLM_MIN_CHARS_DEFAULT = 1200;
export const SECURITY_REVIEW_SAMPLE_RATE_DEFAULT = 0.1;

export function getSecurityReviewAlwaysLlmMinChars(): number {
  const raw = process.env.SECURITY_REVIEW_ALWAYS_LLM_MIN_CHARS?.trim();
  if (!raw) return SECURITY_REVIEW_ALWAYS_LLM_MIN_CHARS_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 200 && n <= 50_000 ? Math.floor(n) : SECURITY_REVIEW_ALWAYS_LLM_MIN_CHARS_DEFAULT;
}

export function getSecurityReviewSampleRate(): number {
  const raw = process.env.SECURITY_REVIEW_SAMPLE_RATE?.trim();
  if (!raw) return SECURITY_REVIEW_SAMPLE_RATE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return SECURITY_REVIEW_SAMPLE_RATE_DEFAULT;
  return n;
}

export function shouldEnqueueSecurityReviewLlm(params: {
  assistantContent: string;
  syncRuleTags: string[];
}): boolean {
  if (params.syncRuleTags.length > 0) return true;
  if (params.assistantContent.length >= getSecurityReviewAlwaysLlmMinChars()) return true;
  return Math.random() < getSecurityReviewSampleRate();
}
