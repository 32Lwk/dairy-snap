import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/ai/openai";
import { requireSession } from "@/lib/api/require-session";
import { sha256Hex } from "@/lib/crypto/sha256";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";
import { resolvePolicyVersion, resolvePromptVersion } from "@/server/prompts";
import { LIMITS, getTodayCounter, incrementImageGen } from "@/server/usage";

export const runtime = "nodejs";

const schema = z.object({
  entryId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  /** 日記草案など。情景に反映する（画像内に文字は出さない旨をプロンプトで指示） */
  journalContext: z.string().max(12000).optional(),
});

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

  const counter = await getTodayCounter(session.user.id);
  if (counter.imageGenerations >= LIMITS.IMAGE_GEN_PER_DAY) {
    return NextResponse.json({ error: "本日の画像生成上限に達しました" }, { status: 429 });
  }

  const ctx = parsed.data.journalContext?.trim();
  const ctxBlock =
    ctx && ctx.length > 0
      ? `次の日記・メモの内容に視覚的に沿った一枚の写真にしてください（登場人物は一般化し特定個人の顔は写さない）。画像内に文字・看板・スクリーンの判読可能な文字は入れないでください。\n\n---\n${ctx.slice(0, 6000)}\n---\n\n`
      : "";

  const openai = getOpenAI();
  const started = Date.now();
  const img = await openai.images.generate({
    model: "dall-e-3",
    prompt: `フォトリアルな写真風。日本の日常のワンシーン。${ctxBlock}追加の指示: ${parsed.data.prompt}`,
    size: "1024x1024",
    quality: "hd",
    n: 1,
  });

  const url = img.data?.[0]?.url;
  if (!url) return NextResponse.json({ error: "画像URLを取得できませんでした" }, { status: 502 });

  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = "image/png";
  const id = randomUUID();
  const storageKey = `${session.user.id}/${entry.id}/gen-${id}.png`;
  const storage = getObjectStorage();
  await storage.put({ key: storageKey, body: buf, contentType: mime });

  const latencyMs = Date.now() - started;
  const image = await prisma.image.create({
    data: {
      entryId: entry.id,
      kind: "GENERATED",
      storageKey,
      mimeType: mime,
      byteSize: buf.length,
      sha256: sha256Hex(buf),
    },
  });

  await incrementImageGen(session.user.id);

  await prisma.aIArtifact.create({
    data: {
      userId: session.user.id,
      entryId: entry.id,
      kind: "IMAGE_PROMPT",
      promptVersion: resolvePromptVersion("reflective_chat"),
      policyVersion: resolvePolicyVersion("auxiliary_default"),
      model: "dall-e-3",
      latencyMs,
      metadata: { promptLen: parsed.data.prompt.length },
    },
  });

  return NextResponse.json({ imageId: image.id });
}
