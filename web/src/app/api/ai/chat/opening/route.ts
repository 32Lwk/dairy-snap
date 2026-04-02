import { NextRequest } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/ai/openai";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { buildReflectiveChatContext } from "@/server/chat-context";
import { loadPromptFile, PROMPT_VERSIONS } from "@/server/prompts";
import { LIMITS, getTodayCounter, incrementChat } from "@/server/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  entryId: z.string().min(1),
});

const OPENING_USER_SIGNAL =
  "（会話はまだ始まっていません。あなたから、今日の振り返りの最初の一言を日本語で短く送ってください。ユーザーのプライバシーに配慮し、断定は避け、共感や軽い質問を1つ含めてもよいです。）";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "入力が不正です" }), { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY が未設定です" }), { status: 503 });
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: parsed.data.entryId, userId: session.user.id },
  });
  if (!entry) {
    return new Response(JSON.stringify({ error: "見つかりません" }), { status: 404 });
  }

  const counter = await getTodayCounter(session.user.id);
  if (counter.chatMessages >= LIMITS.CHAT_PER_DAY) {
    return new Response(JSON.stringify({ error: "本日のチャット上限に達しました" }), { status: 429 });
  }

  let thread = await prisma.chatThread.findFirst({
    where: { entryId: entry.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
  });
  if (!thread) {
    thread = await prisma.chatThread.create({
      data: { entryId: entry.id },
      include: { messages: true },
    });
  }

  if (thread.messages.length > 0) {
    return new Response(JSON.stringify({ skipped: true, threadId: thread.id }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const baseSystem = loadPromptFile("reflective-chat");
  const extraContext = await buildReflectiveChatContext({
    userId: session.user.id,
    entryId: entry.id,
    entryDateYmd: entry.entryDateYmd,
    encryptionMode: entry.encryptionMode,
    currentBody: entry.body,
  });
  const system = `${baseSystem}\n\n${extraContext}\n\n## 会話開始モード\nユーザーはまだメッセージを送っていません。上記の「会話開始シグナル」に応じて、あなたから最初の発話のみを行ってください。`;

  const openai = getOpenAI();
  const started = Date.now();

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: OPENING_USER_SIGNAL },
    ],
  });

  const encoder = new TextEncoder();
  let assistantText = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of stream) {
          const delta = part.choices[0]?.delta?.content ?? "";
          if (delta) {
            assistantText += delta;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          }
        }

        const latencyMs = Date.now() - started;
        const assistant = await prisma.chatMessage.create({
          data: {
            threadId: thread!.id,
            role: "assistant",
            content: assistantText,
            model: "gpt-4o-mini",
            latencyMs,
            tokenEstimate: Math.ceil((OPENING_USER_SIGNAL.length + assistantText.length) / 4),
          },
        });

        await incrementChat(session.user.id);

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            entryId: entry.id,
            action: "ai_chat_opening",
            metadata: {
              threadId: thread!.id,
              model: "gpt-4o-mini",
              latencyMs,
              promptVersion: PROMPT_VERSIONS.reflective_chat,
            },
          },
        });

        await prisma.aIArtifact.create({
          data: {
            userId: session.user.id,
            entryId: entry.id,
            kind: "CHAT_MESSAGE",
            promptVersion: PROMPT_VERSIONS.reflective_chat,
            model: "gpt-4o-mini",
            latencyMs,
            tokenEstimate: assistant.tokenEstimate,
            metadata: {
              threadId: thread!.id,
              opening: true,
              assistantMessageId: assistant.id,
            },
          },
        });

        const prevNotes = (thread!.conversationNotes as Record<string, unknown>) ?? {};
        await prisma.chatThread.update({
          where: { id: thread!.id },
          data: {
            conversationNotes: {
              ...prevNotes,
              openingAt: new Date().toISOString(),
            },
          },
        });

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, threadId: thread!.id })}\n\n`),
        );
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
