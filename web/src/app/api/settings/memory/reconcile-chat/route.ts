import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { runMasMemoryChatHistoryBackfill } from "@/server/mas-memory";

export const runtime = "nodejs";
export const maxDuration = 900;

const bodySchema = z
  .object({
    entryId: z.string().min(1).optional(),
    /** 補完が必要なスレッド（未バックフィル or メッセージ増）をすべて処理 */
    allWithChat: z.boolean().optional(),
    /** 同一メッセージ件数でも再実行（上書き補完） */
    force: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.entryId) || d.allWithChat === true, {
    message: "entryId を指定するか、allWithChat を true にしてください",
  });

async function countUserAssistantMessages(threadId: string): Promise<number> {
  return prisma.chatMessage.count({
    where: { threadId, role: { in: ["user", "assistant"] } },
  });
}

function backfillReasonJa(reason: string): string {
  const m: Record<string, string> = {
    disabled: "記憶抽出がオフです（DISABLE_MEMORY_EXTRACTION）",
    no_api_key: "OpenAI API キーがありません",
    no_transcript: "チャット本文を組み立てられませんでした",
    parse:
      "記憶JSONの検証に失敗しました（AgentMemory のキー形式・数値の範囲・JSON の切り詰め等で起きることがあります。もう一度お試しください）",
    llm: "AI 応答エラー",
    db: "データベースへの保存に失敗しました",
  };
  return m[reason] ?? reason;
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const force = parsed.data.force === true;
  const capRaw = process.env.MEMORY_BACKFILL_MAX_ENTRIES_PER_REQUEST?.trim();
  const maxLlmRuns = capRaw ? parseInt(capRaw, 10) : 0;
  const capActive = Number.isFinite(maxLlmRuns) && maxLlmRuns > 0;

  if (parsed.data.entryId) {
    const entry = await prisma.dailyEntry.findFirst({
      where: { id: parsed.data.entryId, userId: session.user.id },
      select: { id: true, entryDateYmd: true, encryptionMode: true, body: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }

    const thread = await prisma.chatThread.findFirst({
      where: { entryId: entry.id, entry: { userId: session.user.id } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        memoryChatBackfillAt: true,
        memoryChatBackfillMsgCount: true,
      },
    });
    if (!thread) {
      return NextResponse.json({ ok: true, skipped: true, reason: "チャットスレッドがありません", processed: [] });
    }

    const msgCount = await countUserAssistantMessages(thread.id);
    if (msgCount < 2) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "チャットがほぼありません",
        processed: [],
      });
    }

    if (
      !force &&
      thread.memoryChatBackfillAt != null &&
      thread.memoryChatBackfillMsgCount != null &&
      thread.memoryChatBackfillMsgCount === msgCount
    ) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "この会話は既に補完済みです（新しいメッセージがあると再実行できます）",
        processed: [],
      });
    }

    const result = await runMasMemoryChatHistoryBackfill({
      userId: session.user.id,
      entryId: entry.id,
      threadId: thread.id,
      messageCountForSnapshot: msgCount,
      entryDateYmd: entry.entryDateYmd,
      encryptionMode: entry.encryptionMode,
      diaryBody: entry.body,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.reason === "disabled" ? "記憶抽出が無効です" : "補完に失敗しました",
          reason: result.reason,
        },
        { status: result.reason === "no_api_key" ? 503 : 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      processed: [{ entryId: entry.id, entryDateYmd: entry.entryDateYmd }],
    });
  }

  const pageSize = 80;
  const seenEntry = new Set<string>();
  const processed: { entryId: string; entryDateYmd: string }[] = [];
  const skippedUpToDate: string[] = [];
  const failures: { entryDateYmd: string; reason: string; detailJa: string }[] = [];
  let llmRuns = 0;
  let stoppedEarlyByCap = false;
  let skip = 0;

  outer: while (true) {
    const threads = await prisma.chatThread.findMany({
      where: { entry: { userId: session.user.id } },
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        entryId: true,
        memoryChatBackfillAt: true,
        memoryChatBackfillMsgCount: true,
        entry: {
          select: { id: true, entryDateYmd: true, encryptionMode: true, body: true },
        },
      },
    });

    if (threads.length === 0) break;

    for (const t of threads) {
      if (!t.entry) continue;
      if (seenEntry.has(t.entryId)) continue;

      const msgCount = await countUserAssistantMessages(t.id);
      if (msgCount < 2) continue;

      if (
        !force &&
        t.memoryChatBackfillAt != null &&
        t.memoryChatBackfillMsgCount != null &&
        t.memoryChatBackfillMsgCount === msgCount
      ) {
        seenEntry.add(t.entryId);
        skippedUpToDate.push(t.entry.entryDateYmd);
        continue;
      }

      if (capActive && llmRuns >= maxLlmRuns) {
        stoppedEarlyByCap = true;
        break outer;
      }

      llmRuns += 1;

      const ent = t.entry;
      const result = await runMasMemoryChatHistoryBackfill({
        userId: session.user.id,
        entryId: ent.id,
        threadId: t.id,
        messageCountForSnapshot: msgCount,
        entryDateYmd: ent.entryDateYmd,
        encryptionMode: ent.encryptionMode,
        diaryBody: ent.body,
      });

      seenEntry.add(t.entryId);

      if (result.ok) {
        processed.push({ entryId: ent.id, entryDateYmd: ent.entryDateYmd });
      } else {
        failures.push({
          entryDateYmd: ent.entryDateYmd,
          reason: result.reason,
          detailJa: backfillReasonJa(result.reason),
        });
      }
    }

    skip += pageSize;
    if (threads.length < pageSize) break;
  }

  return NextResponse.json({
    ok: true,
    processed,
    failures: failures.length > 0 ? failures : undefined,
    skippedUpToDate: skippedUpToDate.length > 0 ? skippedUpToDate.slice(0, 40) : undefined,
    llmRuns,
    stoppedEarlyByCap: stoppedEarlyByCap || undefined,
    maxLlmRunsPerRequest: capActive ? maxLlmRuns : undefined,
    hint:
      stoppedEarlyByCap
        ? `一度に処理する上限（MEMORY_BACKFILL_MAX_ENTRIES_PER_REQUEST=${maxLlmRuns}）に達しました。もう一度実行すると続きを処理します。`
        : processed.length === 0 && failures.length > 0
          ? "いずれの日も補完に失敗しました。表示の理由を確認してください。"
          : processed.length === 0 && skippedUpToDate.length > 0
            ? "未処理の会話はありませんでした（すべて補完済みのスナップショットです）。会話が増えたあと再実行するか、強制再補完を試してください。"
            : failures.length > 0
              ? "一部の日は失敗しました（failures）。成功した日のみ記憶が更新されています。"
              : undefined,
  });
}
