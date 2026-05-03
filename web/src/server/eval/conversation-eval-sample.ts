import type { Prisma } from "@/generated/prisma/client";
import { passesEvalSamplingGate } from "@/lib/eval-sampling";
import { prisma } from "@/server/db";

export type SaveConversationEvalSampleArgs = {
  userId: string;
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
  promptVersion: string;
  policyVersion: string;
  userContent: string;
  assistantContent: string;
  metadata?: Prisma.InputJsonValue;
};

function evalSampleExpiresAt(): Date | undefined {
  const raw = process.env.EVAL_SAMPLE_RETENTION_DAYS?.trim() ?? "90";
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** `EVAL_REDACT_EMAIL=1` のときメール風文字列を簡易マスク（厳密な PII 分類ではない） */
function maybeMaskEvalPlaintext(s: string): string {
  if (process.env.EVAL_REDACT_EMAIL !== "1") return s;
  return s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[redacted-email]");
}

/**
 * 呼び出し側で同意・暗号化モードを満たしたうえで Eval 行を書く。
 * - サンプリング: `EVAL_SAMPLE_RATE`（例: 0.1 で約10%）
 * - 保持期限: `EVAL_SAMPLE_RETENTION_DAYS`（既定 90 日、`0` 以下で未設定）
 * - 任意マスク: `EVAL_REDACT_EMAIL=1`
 */
export function scheduleConversationEvalSampleInsert(args: SaveConversationEvalSampleArgs): void {
  if (!passesEvalSamplingGate()) return;
  const expiresAt = evalSampleExpiresAt();
  const userContent = maybeMaskEvalPlaintext(args.userContent);
  const assistantContent = maybeMaskEvalPlaintext(args.assistantContent);
  void prisma.conversationEvalSample
    .create({
      data: {
        userId: args.userId,
        threadId: args.threadId,
        userMessageId: args.userMessageId,
        assistantMessageId: args.assistantMessageId,
        promptVersion: args.promptVersion,
        policyVersion: args.policyVersion,
        userContent,
        assistantContent,
        ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      },
    })
    .catch(() => {});
}
