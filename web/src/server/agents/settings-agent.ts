/**
 * 会話からの設定変更「提案」のみを扱う（DB 適用はチャット API の二段確認後）。
 * オーケストレーターの `propose_settings_change` ツール実装。
 */
import type { Prisma } from "@/generated/prisma/client";
import { normalizeProposeSettingsArgs } from "@/lib/settings-proposal-tool";
import { prisma } from "@/server/db";

/**
 * ツール実行結果テキストを生成し、保留を `conversationNotes.pendingSettingsChange` に保存する。
 */
export async function runProposeSettingsChangeTool(params: {
  rawArgs: unknown;
  threadId: string | null;
}): Promise<string> {
  const n = normalizeProposeSettingsArgs(params.rawArgs);
  if (!n.ok) {
    return n.errorJa;
  }

  const lines: string[] = [
    "【設定変更の提案（未適用）】",
    "次のターンでユーザーが「はい」「お願い」などと肯定したときだけサーバーが適用します。",
  ];
  if (n.patch.dayBoundaryEndTime !== undefined) {
    lines.push(
      `前の日の終了時刻: ${n.patch.dayBoundaryEndTime === null ? "未設定（既定00:00相当）" : n.patch.dayBoundaryEndTime}`,
    );
  }
  if (n.patch.timeZone !== undefined) {
    lines.push(`タイムゾーン: ${n.patch.timeZone}`);
  }
  if (n.reasonJa) lines.push(`理由: ${n.reasonJa}`);

  if (params.threadId) {
    const trow = await prisma.chatThread.findUnique({
      where: { id: params.threadId },
      select: { conversationNotes: true },
    });
    const notes = (trow?.conversationNotes as Record<string, unknown>) ?? {};
    await prisma.chatThread.update({
      where: { id: params.threadId },
      data: {
        conversationNotes: {
          ...notes,
          pendingSettingsChange: {
            ...n.patch,
            reasonJa: n.reasonJa,
            proposedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });
    lines.push("（このスレッドに保留を保存しました）");
  } else {
    lines.push("（スレッドIDが無いため保留を保存できませんでした）");
  }

  return lines.join("\n");
}
