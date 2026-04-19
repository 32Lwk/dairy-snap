import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { OPENING_PENDING_MODEL } from "@/lib/opening-pending";
import { prisma } from "@/server/db";
import { claimThreadForOpening } from "@/server/opening-thread-claim";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCalls } from "@/server/usage";
import { runOrchestrator, triggerSupervisorAsync } from "@/server/orchestrator";
import { runMasMemoryExtraction } from "@/server/mas-memory";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { upsertTextEmbedding } from "@/server/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  entryId: z.string().min(1),
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

  const claim = await claimThreadForOpening(entry.id);

  if (claim.kind === "skip") {
    return new Response(JSON.stringify({ skipped: true, threadId: claim.threadId }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (claim.kind === "in_progress") {
    return new Response(
      JSON.stringify({
        skipped: true,
        threadId: claim.threadId,
        openingInProgress: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  const threadId = claim.threadId;
  const assistantMessageId = claim.assistantMessageId;

  const started = Date.now();

  const { stream, agentsUsed, personaInstructions, mbtiHint, orchestratorModel } = await runOrchestrator({
    userId: session.user.id,
    entryId: entry.id,
    entryDateYmd: entry.entryDateYmd,
    userMessage: "",
    historyMessages: [],
    isOpening: true,
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
        const assistant = await prisma.chatMessage.update({
          where: { id: assistantMessageId },
          data: {
            content: assistantText,
            model: orchestratorModel,
            latencyMs,
            tokenEstimate: Math.ceil(assistantText.length / 4),
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
            action: "ai_orchestrator_opening_complete",
            metadata: {
              threadId,
              model: orchestratorModel,
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
            model: orchestratorModel,
            latencyMs,
            tokenEstimate: assistant.tokenEstimate,
            metadata: {
              threadId,
              assistantMessageId: assistant.id,
              agentsUsed,
              mas: true,
              isOpening: true,
            },
          },
        });

        triggerSupervisorAsync({
          userId: session.user.id,
          threadId,
          agentsUsed,
          recentMessages: [{ role: "assistant", content: assistantText }],
          personaInstructions,
          mbtiHint: mbtiHint || undefined,
        });

        void runMasMemoryExtraction({
          userId: session.user.id,
          entryId: entry.id,
          entryDateYmd: entry.entryDateYmd,
          encryptionMode: entry.encryptionMode,
          diaryBody: entry.body,
          userMessage: "",
          assistantMessage: assistantText,
          recentTurns: [{ role: "assistant" as const, content: assistantText }],
        }).catch(() => {});

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, threadId, agentsUsed })}\n\n`),
        );
        controller.close();
      } catch (e) {
        await prisma.chatMessage
          .deleteMany({
            where: { id: assistantMessageId, model: OPENING_PENDING_MODEL },
          })
          .catch(() => {});
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
