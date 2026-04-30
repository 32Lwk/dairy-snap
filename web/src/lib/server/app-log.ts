/**
 * サーバー用アプリログ（構造化・非同期送出）。
 * - リクエストのクリティカルパスをブロックしないよう setImmediate で stdout へ回す。
 * - JSON 1 行 / Cloud Logging・Datadog 等の取り込みを想定。
 *
 * 環境変数:
 * - APP_LOG_LEVEL: off | error | warn | info | debug（未設定時は warn）
 * - APP_LOG_SCOPES: カンマ区切り scope 名。info/debug のみフィルタ。空なら全 scope。
 * - APP_LOG_INCLUDE_IDS: "1" のとき userId / entryId などをペイロードに含められる（既定はマスク）
 */

import { randomUUID } from "node:crypto";

export type AppLogLevel = "error" | "warn" | "info" | "debug";

/** 呼び出し側で揃える scope 名（文字列でも可） */
export const AppLogScope = {
  opening: "opening",
  orchestrator: "orchestrator",
  calendar: "calendar",
  api: "api",
  auth: "auth",
  chat: "chat",
  settings: "settings",
  security: "security",
  entries: "entries",
  journal: "journal",
  account: "account",
  memory: "memory",
} as const;

const SEVERITY_ORDER: Record<AppLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

type Threshold = AppLogLevel | "off";

function readThreshold(): Threshold {
  const raw = (process.env.APP_LOG_LEVEL ?? "warn").trim().toLowerCase();
  if (raw === "off" || raw === "none" || raw === "silent") return "off";
  if (raw === "error" || raw === "warn" || raw === "info" || raw === "debug") return raw;
  return "warn";
}

function readScopeFilter(): Set<string> | null {
  const raw = (process.env.APP_LOG_SCOPES ?? "").trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : null;
}

function includeIds(): boolean {
  const v = process.env.APP_LOG_INCLUDE_IDS ?? "";
  return v === "1" || v.toLowerCase() === "true";
}

let cachedThreshold: Threshold | undefined;
let cachedScopes: Set<string> | null | undefined;
let cachedIncludeIds: boolean | undefined;

function config() {
  if (cachedThreshold === undefined) cachedThreshold = readThreshold();
  if (cachedScopes === undefined) cachedScopes = readScopeFilter();
  if (cachedIncludeIds === undefined) cachedIncludeIds = includeIds();
  return {
    threshold: cachedThreshold,
    scopes: cachedScopes,
    includeIds: cachedIncludeIds,
  };
}

/** テスト用: キャッシュをクリア */
export function _resetAppLogConfigForTests(): void {
  cachedThreshold = undefined;
  cachedScopes = undefined;
  cachedIncludeIds = undefined;
}

export function shouldEmitAppLog(scope: string, level: AppLogLevel): boolean {
  const { threshold, scopes } = config();
  if (threshold === "off") return false;
  if (SEVERITY_ORDER[level] > SEVERITY_ORDER[threshold]) return false;
  if (level === "info" || level === "debug") {
    if (scopes !== null && !scopes.has(scope)) return false;
  }
  return true;
}

function maskId(id: string | undefined | null): string | undefined {
  if (!id) return undefined;
  if (id.length <= 12) return "[id]";
  return `${id.slice(0, 8)}…`;
}

export type AppLogFields = Record<string, unknown>;

function sanitizeFields(fields: AppLogFields | undefined, allowIds: boolean): AppLogFields | undefined {
  if (!fields) return undefined;
  if (allowIds) return { ...fields };
  const out: AppLogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (
      k === "userId" ||
      k === "entryId" ||
      k === "threadId" ||
      k === "sessionUserId" ||
      k.endsWith("UserId")
    ) {
      out[k] = typeof v === "string" ? maskId(v) : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emitLine(payload: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify(payload));
  } catch {
    console.log(`{"level":"error","scope":"app_log","msg":"serialize_failed"}`);
  }
}

/**
 * 非同期で 1 行 JSON を stdout へ。await しないこと。
 */
export function scheduleAppLog(
  scope: string,
  level: AppLogLevel,
  msg: string,
  fields?: AppLogFields,
  opts?: { correlationId?: string },
): void {
  if (!shouldEmitAppLog(scope, level)) return;
  const { includeIds } = config();
  const correlationId = opts?.correlationId ?? randomUUID();
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    correlationId,
    ...sanitizeFields(fields, includeIds),
  };
  setImmediate(() => {
    emitLine(payload);
  });
}

/** このオーケストレータ実行に紐づく correlationId（複数行を突合） */
export function newCorrelationId(): string {
  return randomUUID();
}
