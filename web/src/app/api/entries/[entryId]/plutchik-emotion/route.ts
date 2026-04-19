import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createDefaultOrchestrator } from "@/lib/mas/factory";
import type { PlutchikEmotionInput, PlutchikEmotionOutput } from "@/lib/mas/agents/plutchik-emotion";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { buildEntryChatTranscript } from "@/lib/chat/build-entry-chat-transcript";
import { PLUTCHIK_MIN_TRANSCRIPT_CHARS } from "@/lib/emotion/plutchik-min-transcript";
import { dominantPlutchikKey, plutchikStoredAnalysisSchema, type PlutchikStoredAnalysis } from "@/lib/emotion/plutchik";

export const runtime = "nodejs";
export const maxDuration = 90;

const bodySchema = z.object({
  threadId: z.string().min(1),
});

type RouteCtx = { params: Promise<{ entryId: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 503 });
  }

  const { entryId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: entryId, userId: session.user.id },
    select: { id: true, entryDateYmd: true },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const thread = await prisma.chatThread.findFirst({
    where: {
      id: parsedBody.data.threadId,
      entryId: entry.id,
      entry: { userId: session.user.id },
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 120,
        select: { role: true, content: true },
      },
    },
  });
  if (!thread) return NextResponse.json({ error: "スレッドが見つかりません" }, { status: 404 });

  const { transcript, charCount } = buildEntryChatTranscript(thread.messages);
  if (charCount < PLUTCHIK_MIN_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      { error: `会話が短すぎます（${PLUTCHIK_MIN_TRANSCRIPT_CHARS}文字以上で分析できます）` },
      { status: 400 },
    );
  }

  const orchestrator = createDefaultOrchestrator();
  const result = await orchestrator.runAgent<PlutchikEmotionInput, PlutchikEmotionOutput>(
    "plutchik-emotion",
    { transcript, entryDateYmd: entry.entryDateYmd },
    { userId: session.user.id, entryId: entry.id, threadId: thread.id },
  );

  if (!result.ok || !result.data) {
    return NextResponse.json({ error: result.error ?? "分析に失敗しました" }, { status: 422 });
  }

  const d = result.data;
  const storedRaw: PlutchikStoredAnalysis = {
    schemaVersion: 1,
    computedAt: new Date().toISOString(),
    model: d.model,
    threadId: thread.id,
    promptVersion: PROMPT_VERSIONS.plutchik_emotion,
    summaryJa: d.summaryJa,
    primary: d.primary,
    usage: {
      promptTokens: d.promptTokens,
      completionTokens: d.completionTokens,
      ...(d.totalTokens != null ? { totalTokens: d.totalTokens } : {}),
    },
  };

  const validated = plutchikStoredAnalysisSchema.safeParse(storedRaw);
  if (!validated.success) {
    return NextResponse.json({ error: "保存データの検証に失敗しました" }, { status: 500 });
  }

  const dominant = dominantPlutchikKey(validated.data.primary);

  try {
    await prisma.dailyEntry.update({
      where: { id: entry.id },
      data: {
        plutchikAnalysis: validated.data as object,
        dominantEmotion: dominant,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // スキーマ追加後に `prisma generate` 未実行、または dev の global Prisma が古いとき
    if (msg.includes("Unknown argument") && msg.includes("plutchikAnalysis")) {
      return NextResponse.json(
        {
          error:
            "Prisma クライアントが古いです。`web` ディレクトリで `npx prisma generate` を実行し、開発サーバーを再起動してください。",
        },
        { status: 503 },
      );
    }
    // マイグレーション未適用など
    if (msg.includes("plutchikAnalysis") && /column|does not exist|42703/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "データベースに `plutchikAnalysis` 列がありません。`npx prisma migrate deploy`（または開発用 `migrate dev`）を実行してください。",
        },
        { status: 503 },
      );
    }
    throw e;
  }

  return NextResponse.json({
    dominantEmotion: dominant,
    analysis: validated.data,
  });
}
