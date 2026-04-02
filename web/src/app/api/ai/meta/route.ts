import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/ai/openai";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { LIMITS, getTodayCounter, incrementDailySummary } from "@/server/usage";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), entryId: z.string() }),
  z.object({ kind: z.literal("tags"), entryId: z.string() }),
  z.object({ kind: z.literal("daily_summary"), entryId: z.string() }),
]);

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: parsed.data.entryId, userId: session.user.id },
  });
  if (!entry) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  if (parsed.data.kind === "daily_summary") {
    const counter = await getTodayCounter(session.user.id);
    if (counter.dailySummaries >= LIMITS.DAILY_SUMMARY_PER_DAY) {
      return NextResponse.json({ error: "本日の日次要約上限に達しました" }, { status: 429 });
    }
  }

  const openai = getOpenAI();
  const started = Date.now();

  let prompt = "";
  let kind: "TITLE_SUGGESTION" | "TAG_SUGGESTION" | "DAILY_SUMMARY" = "TITLE_SUGGESTION";
  let promptVersion = "";

  if (parsed.data.kind === "title") {
    kind = "TITLE_SUGGESTION";
    promptVersion = PROMPT_VERSIONS.reflective_chat;
    prompt = `次の日記本文から、短い日本語タイトルを1つだけ提案してください（引用符なし、20文字以内）。\n\n${entry.body.slice(0, 12000)}`;
  } else if (parsed.data.kind === "tags") {
    kind = "TAG_SUGGESTION";
    promptVersion = PROMPT_VERSIONS.reflective_chat;
    prompt = `次の日記から、日本語のタグをカンマ区切りで5つ以内で提案してください。\n\n${entry.body.slice(0, 12000)}`;
  } else {
    kind = "DAILY_SUMMARY";
    promptVersion = PROMPT_VERSIONS.reflective_chat;
    prompt = `次の日記を、日本語で箇条書き中心に要約してください（200〜400字）。\n\n${entry.body.slice(0, 12000)}`;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const latencyMs = Date.now() - started;

  if (parsed.data.kind === "daily_summary") {
    await incrementDailySummary(session.user.id);
  }

  await prisma.aIArtifact.create({
    data: {
      userId: session.user.id,
      entryId: entry.id,
      kind,
      promptVersion,
      model: "gpt-4o-mini",
      latencyMs,
      metadata: { action: parsed.data.kind },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      entryId: entry.id,
      action: `ai_meta_${parsed.data.kind}`,
      metadata: { model: "gpt-4o-mini", latencyMs },
    },
  });

  if (parsed.data.kind === "title") {
    await prisma.dailyEntry.update({
      where: { id: entry.id },
      data: { title: text },
    });
  }

  return NextResponse.json({ result: text });
}
