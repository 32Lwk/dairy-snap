import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { runMasMemoryThreadReconcile } from "@/server/mas-memory";
import { upsertTextEmbedding } from "@/server/embeddings";
import { deleteEmbeddingsForTargets } from "@/server/embeddings";
import { regenerateReflectiveChatTail } from "@/server/reflective-chat-user-edit-regeneration";

export const runtime = "nodejs";
export const maxDuration = 120;

const patchSchema = z.object({
  content: z.string().min(1).max(16000),
  /** 再実行: この発言以降を消して AI が答え直す。再実行しない: 本文のみ更新し記憶整合のみ（以降の会話は保持）。 */
  followingAction: z.enum(["regenerate", "keep"]).optional().default("keep"),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { messageId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const existing = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      thread: { entry: { userId: session.user.id } },
    },
    include: {
      thread: {
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 80 },
          entry: {
            select: { id: true, entryDateYmd: true, encryptionMode: true, body: true },
          },
        },
      },
    },
  });
  if (!existing) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (existing.role !== "user") {
    return NextResponse.json({ error: "ユーザー発言のみ編集できます" }, { status: 400 });
  }

  const ent = existing.thread.entry;
  const ordered = existing.thread.messages;
  const idx = ordered.findIndex((m) => m.id === messageId);
  if (idx < 0) {
    return NextResponse.json({ error: "メッセージがスレッドにありません" }, { status: 400 });
  }

  const newContent = parsed.data.content;
  const tail = ordered.slice(idx + 1);
  const hasFollowing = tail.length > 0;
  const wantRegenerate = hasFollowing && parsed.data.followingAction === "regenerate";

  let editOutcome: "kept_tail" | "regenerated_tail" = "kept_tail";
  let removedFollowingCount = 0;
  let newAssistant: {
    id: string;
    role: string;
    content: string;
    model: string | null;
    sentAt: string;
  } | null = null;

  if (wantRegenerate) {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "「再実行」には OpenAI（OPENAI_API_KEY）の設定が必要です" },
        { status: 503 },
      );
    }
    try {
      const updated = await prisma.chatMessage.update({
        where: { id: messageId },
        data: { content: newContent },
      });

      if (ent.encryptionMode === "STANDARD") {
        void upsertTextEmbedding(session.user.id, "CHAT_MESSAGE", messageId, newContent).catch(() => {});
      }

      const regen = await regenerateReflectiveChatTail({
        userId: session.user.id,
        editedUserMessageId: messageId,
        threadId: existing.threadId,
        entry: ent,
      });

      removedFollowingCount = regen.removedFollowingCount;
      newAssistant = {
        id: regen.assistant.id,
        role: "assistant",
        content: regen.assistant.content,
        model: regen.assistant.model,
        sentAt: regen.assistant.sentAt,
      };
      editOutcome = "regenerated_tail";

      await prisma.chatThread.update({
        where: { id: existing.threadId },
        data: { memoryChatBackfillAt: null, memoryChatBackfillMsgCount: null },
      });

      after(() =>
        runMasMemoryThreadReconcile({
          userId: session.user.id,
          entryId: ent.id,
          entryDateYmd: ent.entryDateYmd,
          encryptionMode: ent.encryptionMode,
          diaryBody: ent.body,
        }).catch(() => {}),
      );

      return NextResponse.json({
        message: updated,
        editOutcome,
        removedFollowingCount,
        newAssistant,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("本日のチャット上限")) {
        return NextResponse.json({ error: msg }, { status: 429 });
      }
      console.error("reflective_chat_regenerate_after_edit", e);
      return NextResponse.json({ error: "会話の再実行に失敗しました" }, { status: 500 });
    }
  }

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: newContent },
  });

  if (ent.encryptionMode === "STANDARD") {
    void upsertTextEmbedding(session.user.id, "CHAT_MESSAGE", messageId, newContent).catch(() => {});
  }

  await prisma.chatThread.update({
    where: { id: existing.threadId },
    data: { memoryChatBackfillAt: null, memoryChatBackfillMsgCount: null },
  });

  after(() =>
    runMasMemoryThreadReconcile({
      userId: session.user.id,
      entryId: ent.id,
      entryDateYmd: ent.entryDateYmd,
      encryptionMode: ent.encryptionMode,
      diaryBody: ent.body,
    }).catch(() => {}),
  );

  return NextResponse.json({
    message: updated,
    editOutcome,
    removedFollowingCount,
    newAssistant,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> },
) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { messageId } = await ctx.params;

  const existing = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      thread: { entry: { userId: session.user.id } },
    },
    select: {
      id: true,
      role: true,
      threadId: true,
      thread: {
        select: {
          entry: {
            select: { id: true, entryDateYmd: true, encryptionMode: true, body: true },
          },
        },
      },
    },
  });
  if (!existing) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (existing.role !== "user") {
    return NextResponse.json({ error: "ユーザー発言のみ削除できます" }, { status: 400 });
  }

  const ent = existing.thread.entry;
  const userId = session.user.id;

  const ordered = await prisma.chatMessage.findMany({
    where: { threadId: existing.threadId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const idx = ordered.findIndex((r) => r.id === messageId);
  if (idx < 0) {
    return NextResponse.json({ error: "メッセージがスレッドにありません" }, { status: 400 });
  }

  const toDelete = ordered.slice(idx).map((r) => r.id);

  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { id: { in: toDelete } } }),
    prisma.chatThread.update({
      where: { id: existing.threadId },
      data: { memoryChatBackfillAt: null, memoryChatBackfillMsgCount: null },
    }),
  ]);

  const stripEmbeddings = ent.encryptionMode === "STANDARD";

  after(() => {
    void (async () => {
      if (stripEmbeddings && toDelete.length > 0) {
        await deleteEmbeddingsForTargets(userId, "CHAT_MESSAGE", toDelete).catch(() => {});
      }
      await runMasMemoryThreadReconcile({
        userId,
        entryId: ent.id,
        entryDateYmd: ent.entryDateYmd,
        encryptionMode: ent.encryptionMode,
        diaryBody: ent.body,
      }).catch(() => {});
    })();
  });

  return NextResponse.json({
    ok: true,
    removedCount: toDelete.length,
    removedMessageIds: toDelete,
  });
}
