import { env } from "@/env";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** 開放モード: AUTH_ACCESS_MODE=open、または allowlist かつ ALLOWED_EMAILS が * / ALL */
export function isAllowlistOpenAccess(): boolean {
  if (env.AUTH_ACCESS_MODE === "open") return true;
  const raw = env.ALLOWED_EMAILS.trim();
  return raw === "*" || raw.toLowerCase() === "all";
}

export function parseAllowedEmailSet(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((x) => normalizeEmail(x))
      .filter(Boolean),
  );
}

/** 許可メールの集合。`null` は「制限なし（全員）」 */
export function getAllowlistSet(): Set<string> | null {
  if (isAllowlistOpenAccess()) return null;
  return parseAllowedEmailSet(env.ALLOWED_EMAILS);
}

export function emailMatchesAllowlist(email: string | null | undefined): boolean {
  const normalized = email ? normalizeEmail(email) : null;
  if (!normalized) return false;
  const set = getAllowlistSet();
  if (set === null) return true;
  return set.has(normalized);
}
