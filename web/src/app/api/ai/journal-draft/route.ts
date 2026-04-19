import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createDefaultOrchestrator } from "@/lib/mas/factory";
import type { JournalComposerInput, JournalComposerOutput } from "@/lib/mas/agents/journal-composer";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { runMasMemoryDiaryConsolidation } from "@/server/mas-memory";
import { mergeAiDiarySection } from "@/lib/journal/ai-diary-section";
import { filterGroundedSuggestedTagsCsv } from "@/lib/journal/ground-suggested-tags";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { buildEntryChatTranscript } from "@/lib/chat/build-entry-chat-transcript";
import { classifyJournalDraftMaterial } from "@/lib/reflective-chat-diary-nudge-rules";
import { parseUserSettings } from "@/lib/user-settings";

export const runtime = "nodejs";
export const maxDuration = 120;

const genSchema = z.object({
  entryId: z.string().min(1),
  threadId: z.string().min(1),
  /** 素材が thin / empty のとき、利用者が了承したうえで生成する */
  forceInsufficient: z.boolean().optional(),
});

const approveSchema = z.object({
  entryId: z.string().min(1),
  draftMarkdown: z.string().min(1),
  /** プレビューで編集したタイトル（空文字でクリア） */
  entryTitle: z.string().max(120).optional(),
  /** カンマ・読点区切りのタグ（空で既存タグをすべて外す） */
  tagsCsv: z.string().max(2000).optional(),
  /** 最終版として記憶の全体整理を走らせる（草案の試行では false のまま） */
  consolidateMemory: z.boolean().optional(),
});

async function replaceEntryTagsFromCsv(entryId: string, userId: string, csv: string): Promise<void> {
  const names = Array.from(
    new Set(
      csv
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter((n) => n.length > 0 && n.length <= 48),
    ),
  ).slice(0, 12);

  await prisma.$transaction(async (tx) => {
    await tx.entryTag.deleteMany({ where: { entryId } });
    for (const name of names) {
      const tag = await tx.tag.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
      });
      await tx.entryTag.create({
        data: { entryId, tagId: tag.id },
      });
    }
  });
}

async function loadThreadForJournalDraft(sessionUserId: string, entryId: string, threadId: string) {
  return prisma.chatThread.findFirst({
    where: {
      id: threadId,
      entryId,
      entry: { userId: sessionUserId },
    },
    include: {
      entry: { select: { entryDateYmd: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 120,
        select: { role: true, content: true },
      },
    },
  });
}

/** 会話の素材判定（UI の説明文・PUT のゲート用） */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const { searchParams } = new URL(req.url);
  const entryId = searchParams.get("entryId") ?? "";
  const threadId = searchParams.get("threadId") ?? "";
  if (!entryId || !threadId) {
    return NextResponse.json({ error: "entryId と threadId が必要です" }, { status: 400 });
  }

  const [thread, userRow] = await Promise.all([
    loadThreadForJournalDraft(session.user.id, entryId, threadId),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true },
    }),
  ]);
  if (!thread) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const profile = parseUserSettings(userRow?.settings ?? {}).profile;
  const chatLines = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
  const journalDraftMaterial = classifyJournalDraftMaterial(chatLines, {
    aiDepthLevel: profile?.aiDepthLevel,
    aiChatTone: profile?.aiChatTone,
  });

  return NextResponse.json({ journalDraftMaterial });
}

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

  const [thread, userRow] = await Promise.all([
    loadThreadForJournalDraft(session.user.id, parsed.data.entryId, parsed.data.threadId),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true },
    }),
  ]);
  if (!thread) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const profile = parseUserSettings(userRow?.settings ?? {}).profile;
  const chatLines = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
  const journalDraftMaterial = classifyJournalDraftMaterial(chatLines, {
    aiDepthLevel: profile?.aiDepthLevel,
    aiChatTone: profile?.aiChatTone,
  });

  const forceInsufficient = parsed.data.forceInsufficient === true;
  if (!forceInsufficient && journalDraftMaterial.tier !== "rich") {
    return NextResponse.json(
      {
        error: "会話の材料がまだ十分ではありません。了承して生成するか、あとからもう一度お試しください。",
        code: "journal_draft_material_insufficient",
        journalDraftMaterial,
      },
      { status: 409 },
    );
  }

  const { transcript } = buildEntryChatTranscript(thread.messages);

  const started = Date.now();
  const orchestrator = createDefaultOrchestrator();
  const composerInput: JournalComposerInput = {
    transcript,
    entryDateYmd: thread.entry.entryDateYmd,
    materialTier: journalDraftMaterial.tier,
    forceInsufficient,
  };
  const result = await orchestrator.runAgent<JournalComposerInput, JournalComposerOutput>(
    "journal-composer",
    composerInput,
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
  const suggestedTitle = result.data.suggestedTitle ?? "";
  const suggestedTagsRaw = result.data.suggestedTags ?? "";
  /** チャット全文ではなく、生成されたタイトル・草案に現れる語だけをタグに残す（脇話のタグ化を防ぐ） */
  const tagGroundingCorpus = [suggestedTitle, text].filter((s) => s.trim().length > 0).join("\n");
  const suggestedTags = filterGroundedSuggestedTagsCsv(suggestedTagsRaw, tagGroundingCorpus, text);
  const latencyMs = Date.now() - started;

  await prisma.aIArtifact.create({
    data: {
      userId: session.user.id,
      entryId: parsed.data.entryId,
      kind: "JOURNAL_DRAFT",
      promptVersion: PROMPT_VERSIONS.journal_composer,
      model: result.data.model,
      latencyMs,
      metadata: {
        threadId: thread.id,
        suggestedTitle: suggestedTitle.slice(0, 120),
        suggestedTags: suggestedTags.slice(0, 1200),
      },
    },
  });

  return NextResponse.json({
    draft: text,
    suggestedTitle,
    suggestedTags,
    promptVersion: PROMPT_VERSIONS.journal_composer,
  });
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
  const titlePatch =
    parsed.data.entryTitle !== undefined
      ? { title: parsed.data.entryTitle.trim() === "" ? null : parsed.data.entryTitle.trim().slice(0, 120) }
      : {};

  const updated = await prisma.dailyEntry.update({
    where: { id: entry.id },
    data: { body: nextBody, ...titlePatch },
  });

  if (parsed.data.tagsCsv !== undefined) {
    await replaceEntryTagsFromCsv(entry.id, session.user.id, parsed.data.tagsCsv);
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: entry.id,
      action: "ai_diary_merged",
      metadata: { promptVersion: PROMPT_VERSIONS.journal_composer },
    },
  });

  if (parsed.data.consolidateMemory === true) {
    after(() =>
      runMasMemoryDiaryConsolidation({
        userId: session.user.id,
        entryId: entry.id,
        entryDateYmd: entry.entryDateYmd,
        encryptionMode: entry.encryptionMode,
        diaryBody: updated.body,
      }).catch(() => {}),
    );
  }

  const full = await prisma.dailyEntry.findFirst({
    where: { id: entry.id },
    include: { entryTags: { include: { tag: true } }, images: true },
  });

  return NextResponse.json({ entry: full ?? updated });
}
