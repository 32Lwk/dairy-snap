import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { runOrchestrator } from "@/server/orchestrator";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCall } from "@/server/usage";
import { PROMPT_VERSIONS } from "@/server/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  entryId: z.string().min(1),
  message: z.string().min(1).max(16000),
});

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

  const userMsg = await prisma.chatMessage.create({
    data: { threadId: thread.id, role: "user", content: parsed.data.message },
  });

  const history = thread.messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

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
            conversationHistory: history,
            userMessage: parsed.data.message,
          },
          (delta) => {
            assistantText += delta;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          },
        );

        const started = Date.now();
        const assistant = await prisma.chatMessage.create({
          data: {
            threadId: thread!.id,
            role: "assistant",
            content: result.assistantText,
            model: "gpt-4o",
            latencyMs: Date.now() - started,
            tokenEstimate: Math.ceil((parsed.data.message.length + result.assistantText.length) / 4),
            agentName: result.agentsUsed.join(","),
          },
        });

        await incrementChat(session.user.id);
        await incrementOrchestratorCall(session.user.id);

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            entryId: entry.id,
            action: "mas_chat_complete",
            metadata: {
              threadId: thread!.id,
              model: "gpt-4o",
              agentsUsed: result.agentsUsed,
              promptVersion: PROMPT_VERSIONS.reflective_chat,
            },
          },
        });

        await prisma.chatThread.update({
          where: { id: thread!.id },
          data: {
            conversationNotes: {
              lastExcerpt: parsed.data.message.slice(0, 200),
              updatedAt: new Date().toISOString(),
              lastAgentsUsed: result.agentsUsed,
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
