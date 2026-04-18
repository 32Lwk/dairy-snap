import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCalls } from "@/server/usage";
import { runOrchestrator, triggerSupervisorAsync } from "@/server/orchestrator";
import { runMasMemoryExtraction } from "@/server/mas-memory";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { upsertTextEmbedding } from "@/server/embeddings";

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

  const userMsg = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      content: parsed.data.message,
      agentName: "user",
    },
  });
  if (entry.encryptionMode === "STANDARD") {
    void upsertTextEmbedding(session.user.id, "CHAT_MESSAGE", userMsg.id, parsed.data.message).catch(() => {});
  }

  const historyMessages = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const started = Date.now();

  const { stream, agentsUsed, personaInstructions, mbtiHint } = await runOrchestrator({
    userId: session.user.id,
    entryId: entry.id,
    entryDateYmd: entry.entryDateYmd,
    userMessage: parsed.data.message,
    historyMessages,
    isOpening: false,
    encryptionMode: entry.encryptionMode,
    currentBody: entry.body,
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
            model: "gpt-4o",
            latencyMs,
            tokenEstimate: Math.ceil((parsed.data.message.length + assistantText.length) / 4),
            agentName: "orchestrator",
          },
        });
        if (entry.encryptionMode === "STANDARD") {
          void upsertTextEmbedding(session.user.id, "CHAT_MESSAGE", assistant.id, assistantText).catch(() => {});
        }

        await incrementChat(session.user.id);
        await incrementOrchestratorCalls(session.user.id);

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            entryId: entry.id,
            action: "ai_orchestrator_chat_complete",
            metadata: {
              threadId: thread!.id,
              model: "gpt-4o",
              latencyMs,
              agentsUsed,
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
            model: "gpt-4o",
            latencyMs,
            tokenEstimate: assistant.tokenEstimate,
            metadata: {
              threadId: thread!.id,
              userMessageId: userMsg.id,
              assistantMessageId: assistant.id,
              agentsUsed,
              mas: true,
            },
          },
        });

        await prisma.chatThread.update({
          where: { id: thread!.id },
          data: {
            conversationNotes: {
              ...((thread!.conversationNotes as Record<string, unknown>) ?? {}),
              lastExcerpt: parsed.data.message.slice(0, 200),
              updatedAt: new Date().toISOString(),
              lastAgentsUsed: agentsUsed,
            },
          },
        });

        const recentTurns = [
          ...historyMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: parsed.data.message },
          { role: "assistant" as const, content: assistantText },
        ];
        void runMasMemoryExtraction({
          userId: session.user.id,
          entryId: entry.id,
          entryDateYmd: entry.entryDateYmd,
          encryptionMode: entry.encryptionMode,
          diaryBody: entry.body,
          userMessage: parsed.data.message,
          assistantMessage: assistantText,
          recentTurns,
        }).catch(() => {});

        triggerSupervisorAsync({
          userId: session.user.id,
          threadId: thread!.id,
          agentsUsed,
          recentMessages: [
            ...historyMessages.slice(-4),
            { role: "user", content: parsed.data.message },
            { role: "assistant", content: assistantText },
          ],
          personaInstructions,
          mbtiHint: mbtiHint || undefined,
        });

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, threadId: thread!.id, agentsUsed })}\n\n`),
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
