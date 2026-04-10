import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { runOrchestrator } from "@/server/orchestrator";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCall } from "@/server/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  entryId: z.string().min(1),
});

const OPENING_SIGNAL =
  "（会話はまだ始まっていません。あなたから今日の振り返りの最初の一言を日本語で短く送ってください。天気・カレンダー・時間割などのコンテキストを踏まえ、自然な問いかけを1つ入れてください。）";

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
  if (!entry) return new Response(JSON.stringify({ error: "見つかりません" }), { status: 404 });

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

  const encoder = new TextEncoder();
  let assistantText = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const result = await runOrchestrator(
          {
            userId: session.user.id,
            entryId: entry.id,
            entryDateYmd: entry.entryDateYmd,
            encryptionMode: entry.encryptionMode,
            currentBody: entry.body,
            threadId: thread!.id,
            conversationHistory: [],
            userMessage: OPENING_SIGNAL,
            isOpening: true,
          },
          (delta) => {
            assistantText += delta;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          },
        );

        await prisma.chatMessage.create({
          data: {
            threadId: thread!.id,
            role: "assistant",
            content: result.assistantText,
            model: "gpt-4o",
            agentName: result.agentsUsed.join(","),
          },
        });

        await incrementChat(session.user.id);
        await incrementOrchestratorCall(session.user.id);

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
