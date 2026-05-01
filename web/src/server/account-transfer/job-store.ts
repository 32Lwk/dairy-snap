import { randomUUID } from "node:crypto";
import {
  IMPORT_PASSPHRASE_ATTEMPT_LIMIT,
  IMPORT_PASSPHRASE_COUNTING_WINDOW_MINUTES,
} from "@/lib/account-transfer/import-passphrase-policy";

/**
 * エクスポート/インポートのジョブ状態を保持する単一プロセス内のストア。
 *
 * v1 はプロセス再起動を跨がない・単一インスタンスのみ動作する想定。
 * 複数インスタンス時は DB 永続化の Job テーブルへ移行する。
 */

export type ExportJobStatus = "pending" | "running" | "succeeded" | "failed";

export type ExportJob = {
  id: string;
  userId: string;
  status: ExportJobStatus;
  /** 暗号化済みの bundle 本文（succeeded のときに参照可能） */
  encryptedBundle?: string;
  /** バンドルの平文サイズ（圧縮なしの目安） */
  byteLength?: number;
  /** ユーザー向けのエラーメッセージ */
  error?: string;
  createdAt: number;
  /** TTL（自動GC 用）。ms 単位の Date.now() */
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;

const globalForTransfer = globalThis as unknown as {
  __transfer_exportJobs?: Map<string, ExportJob>;
  __transfer_passphraseFailures?: Map<string, PassphraseCounter>;
};

const exportJobs =
  globalForTransfer.__transfer_exportJobs ?? (globalForTransfer.__transfer_exportJobs = new Map());

function gc() {
  const now = Date.now();
  for (const [id, j] of exportJobs) {
    if (j.expiresAt <= now) exportJobs.delete(id);
  }
}

export function createExportJob(userId: string): ExportJob {
  gc();
  const id = randomUUID();
  const now = Date.now();
  const job: ExportJob = {
    id,
    userId,
    status: "pending",
    createdAt: now,
    expiresAt: now + TTL_MS,
  };
  exportJobs.set(id, job);
  return job;
}

export function getExportJob(id: string, userId: string): ExportJob | null {
  gc();
  const job = exportJobs.get(id);
  if (!job) return null;
  if (job.userId !== userId) return null;
  return job;
}

export function setExportJobStatus(
  id: string,
  patch: Partial<Pick<ExportJob, "status" | "encryptedBundle" | "byteLength" | "error">>,
) {
  const job = exportJobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  if (patch.status === "succeeded" || patch.status === "failed") {
    job.expiresAt = Date.now() + TTL_MS;
  }
}

export function deleteExportJob(id: string) {
  exportJobs.delete(id);
}

/* ---------------- Import passphrase 試行カウンタ（in-memory） ---------------- */

type PassphraseCounter = {
  count: number;
  expiresAt: number;
};

// HMR 対策: dev ではモジュールが差し替わり Map が消えるので global に乗せる
const passphraseFailures =
  globalForTransfer.__transfer_passphraseFailures ??
  (globalForTransfer.__transfer_passphraseFailures = new Map());

const PASSPHRASE_WINDOW_MS = IMPORT_PASSPHRASE_COUNTING_WINDOW_MINUTES * 60 * 1000;

/** @deprecated IMPORT_PASSPHRASE_ATTEMPT_LIMIT を優先 */
export const MAX_IMPORT_PASSPHRASE_ATTEMPTS = IMPORT_PASSPHRASE_ATTEMPT_LIMIT;

function passphraseGc() {
  const now = Date.now();
  for (const [k, v] of passphraseFailures) {
    if (v.expiresAt <= now) passphraseFailures.delete(k);
  }
}

export function recordPassphraseFailure(userId: string): {
  count: number;
  exhausted: boolean;
} {
  passphraseGc();
  const now = Date.now();
  const cur = passphraseFailures.get(userId);
  const next: PassphraseCounter = cur && cur.expiresAt > now
    ? { count: cur.count + 1, expiresAt: cur.expiresAt }
    : { count: 1, expiresAt: now + PASSPHRASE_WINDOW_MS };
  passphraseFailures.set(userId, next);
  return {
    count: next.count,
    exhausted: next.count >= IMPORT_PASSPHRASE_ATTEMPT_LIMIT,
  };
}

export function isPassphraseExhausted(userId: string): boolean {
  passphraseGc();
  const cur = passphraseFailures.get(userId);
  if (!cur) return false;
  return cur.count >= IMPORT_PASSPHRASE_ATTEMPT_LIMIT;
}

/** 現在のカウント窓における「あと何回誤るとロック」か（今回の失敗は既にカウント済み想定で API 側で渡す） */
export function getImportPassphraseAttemptsRemaining(userId: string): number {
  passphraseGc();
  const cur = passphraseFailures.get(userId);
  const now = Date.now();
  if (!cur || cur.expiresAt <= now) return IMPORT_PASSPHRASE_ATTEMPT_LIMIT;
  return Math.max(0, IMPORT_PASSPHRASE_ATTEMPT_LIMIT - cur.count);
}

export function clearPassphraseFailures(userId: string) {
  passphraseFailures.delete(userId);
}
