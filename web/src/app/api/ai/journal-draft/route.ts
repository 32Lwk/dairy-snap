import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createDefaultOrchestrator } from "@/lib/mas/factory";
import type { JournalComposerInput, JournalComposerOutput } from "@/lib/mas/agents/journal-composer";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { mergeAiDiarySection } from "@/lib/journal/ai-diary-section";
import { PROMPT_VERSIONS } from "@/server/prompts";

export const runtime = "nodejs";

const genSchema = z.object({
  entryId: z.string().min(1),
  threadId: z.string().min(1),
});

const approveSchema = z.object({
  entryId: z.string().min(1),
  draftMarkdown: z.string().min(1),
});

/** 草案を生成（プレビューのみ。本文には書き込まない） */
export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = genSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const thread = await prisma.chatThread.findFirst({
    where: {
      id: parsed.data.threadId,
      entryId: parsed.data.entryId,
      entry: { userId: session.user.id },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const transcript = thread.messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 24000);

  const started = Date.now();
  const orchestrator = createDefaultOrchestrator();
  const result = await orchestrator.runAgent<JournalComposerInput, JournalComposerOutput>(
    "journal-composer",
    { transcript },
    {
      userId: session.user.id,
      entryId: parsed.data.entryId,
      threadId: thread.id,
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "生成に失敗しました" },
      { status: 500 },
    );
  }
  const text = result.data.draft;
  const latencyMs = Date.now() - started;

  await prisma.aIArtifact.create({
    data: {
      userId: session.user.id,
      entryId: parsed.data.entryId,
      kind: "JOURNAL_DRAFT",
      promptVersion: PROMPT_VERSIONS.journal_composer,
      model: "gpt-4o-mini",
      latencyMs,
      metadata: { threadId: thread.id },
    },
  });

  return NextResponse.json({ draft: text, promptVersion: PROMPT_VERSIONS.journal_composer });
}

/** 草案を AI 日記セクションとして本文に反映 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = approveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: parsed.data.entryId, userId: session.user.id },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const nextBody = mergeAiDiarySection(entry.body, parsed.data.draftMarkdown);
  const updated = await prisma.dailyEntry.update({
    where: { id: entry.id },
    data: { body: nextBody },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: entry.id,
      action: "ai_diary_merged",
      metadata: { promptVersion: PROMPT_VERSIONS.journal_composer },
    },
  });

  return NextResponse.json({ entry: updated });
}
