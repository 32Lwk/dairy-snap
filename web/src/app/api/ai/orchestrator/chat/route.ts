import type { Prisma } from "@/generated/prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCalls } from "@/server/usage";
import { runOrchestrator, triggerSupervisorAsync } from "@/server/orchestrator";
import { runMasMemoryExtraction } from "@/server/mas-memory";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { upsertTextEmbedding } from "@/server/embeddings";
import { computeAssistantStreamDelta, stripAssistantMetaEchoPrefix } from "@/lib/chat-assistant-sanitize";
import { buildSecurityReviewPayload, scheduleSecurityReview } from "@/server/security-review-queue";
import {
  classifyJournalDraftMaterial,
  countUserTurnsIncludingCurrent,
  lastAssistantFromHistory,
  shouldTriggerJournalDraftPanelAfterSend,
  shouldUseMiniOrchestratorForReflectiveChat,
} from "@/lib/reflective-chat-diary-nudge-rules";
import { parseUserSettings } from "@/lib/user-settings";
import { resolveOrchestratorClockNow } from "@/lib/time/client-clock";
import { getUserEffectiveDayContext } from "@/lib/server/user-effective-day";
import {
  applySettingsPatchFromChat,
  isAffirmativeJaMessage,
} from "@/lib/server/apply-settings-from-chat";
import type { SettingsProposalPatch } from "@/lib/settings-proposal-tool";
import { formatPendingSettingsChangeSummaryJa } from "@/lib/settings-proposal-tool";
import { previousCalendarYmdInZone } from "@/lib/time/user-day-boundary";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  entryId: z.string().min(1),
  message: z.string().min(1).max(16000),
  clientNow: z.string().max(40).optional(),
});

function isYesterdayReflectionRequestJa(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // なるべく「昨日」+「振り返り」系の明示要望にだけ反応する（誤爆を避ける）
  if (!t.includes("昨日")) return false;
  if (/(振り返|ふりかえ|振返)/.test(t)) return true;
  if (/昨日.*(話|書|記録|日記)/.test(t)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    scheduleAppLog(AppLogScope.chat, "warn", "orchestrator_chat_bad_request", { reason: "body_schema" });
    return new Response(JSON.stringify({ error: "入力が不正です" }), { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    scheduleAppLog(AppLogScope.chat, "warn", "orchestrator_chat_openai_unconfigured", {});
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY が未設定です" }), { status: 503 });
  }

  const [entryRaw, userRow] = await Promise.all([
    prisma.dailyEntry.findFirst({
      where: { id: parsed.data.entryId, userId: session.user.id },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true },
    }),
  ]);
  if (!entryRaw) {
    scheduleAppLog(AppLogScope.chat, "info", "orchestrator_chat_entry_not_found", {
      entryId: parsed.data.entryId,
    });
    return new Response(JSON.stringify({ error: "見つかりません" }), { status: 404 });
  }
  let entry = entryRaw;
  const originalEntryId = entryRaw.id;
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;

  const counter = await getTodayCounter(session.user.id);
  if (counter.chatMessages >= LIMITS.CHAT_PER_DAY) {
    scheduleAppLog(AppLogScope.chat, "warn", "orchestrator_chat_rate_limited", {
      limit: LIMITS.CHAT_PER_DAY,
    });
    return new Response(JSON.stringify({ error: "本日のチャット上限に達しました" }), { status: 429 });
  }

  const started = Date.now();
  const serverNow = new Date();
  const orchestratorNow = resolveOrchestratorClockNow(serverNow, parsed.data.clientNow);
  const dayCtx = await getUserEffectiveDayContext(session.user.id, orchestratorNow);

  // ユーザーが明示的に「昨日の振り返り」を希望した場合は、昨日エントリへ切り替える（自動遷移）。
  // これにより「今日スレッドに書いてしまった」状態を避ける。
  let navigateToEntryYmd: string | undefined;
  let openTimetableEditorAfterAck = false;
  if (isYesterdayReflectionRequestJa(parsed.data.message)) {
    const yesterdayYmd = previousCalendarYmdInZone(dayCtx.calendarYmd, dayCtx.timeZone);
    if (entry.entryDateYmd !== yesterdayYmd) {
      const yEntry = await prisma.dailyEntry.findUnique({
        where: { userId_entryDateYmd: { userId: session.user.id, entryDateYmd: yesterdayYmd } },
      });
      if (yEntry) {
        // 今日側（originalEntryId）のスレッドに「開口メッセージだけ」が残っている場合は自動削除する。
        // 条件: ユーザー発話がまだ無い（開口のみ）スレッドに限定して誤削除を避ける。
        if (originalEntryId !== yEntry.id) {
          const originalThread = await prisma.chatThread.findFirst({
            where: { entryId: originalEntryId },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          });
          if (originalThread) {
            const originalUserTurns = await prisma.chatMessage.count({
              where: { threadId: originalThread.id, role: "user" },
            });
            if (originalUserTurns === 0) {
              await prisma.chatMessage.deleteMany({
                where: { threadId: originalThread.id, role: "assistant" },
              });
            }
          }
        }

        entry = yEntry;
        navigateToEntryYmd = yesterdayYmd;
      }
    }
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

  const messagesForJournalMaterial = [
    ...historyMessages,
    { role: "user" as const, content: parsed.data.message },
  ];
  const journalDraftMaterial = classifyJournalDraftMaterial(messagesForJournalMaterial, {
    aiDepthLevel: profile?.aiDepthLevel,
    aiChatTone: profile?.aiChatTone,
  });

  const reflectiveUserTurnIncludingCurrent = countUserTurnsIncludingCurrent(historyMessages);
  const lastAssistantText = lastAssistantFromHistory(historyMessages);
  const preferMiniOrchestrator = shouldUseMiniOrchestratorForReflectiveChat(
    parsed.data.message,
    lastAssistantText,
    journalDraftMaterial,
  );
  const triggerJournalDraft = shouldTriggerJournalDraftPanelAfterSend(
    parsed.data.message,
    lastAssistantText,
    journalDraftMaterial,
  );

  const notesRaw = (thread.conversationNotes as Record<string, unknown>) ?? {};
  const pendingRaw = notesRaw.pendingSettingsChange as
    | (SettingsProposalPatch & {
        reasonJa?: string;
        proposedAt?: string;
      })
    | undefined;

  let extraSystemAppend: string | undefined;
  let settingsUndoPayload:
    | {
        previous: { dayBoundaryEndTime: string | null; timeZone: string | null };
        next: { dayBoundaryEndTime: string | null; timeZone: string | null };
      }
    | undefined;
  if (pendingRaw && isAffirmativeJaMessage(parsed.data.message)) {
    const patch: SettingsProposalPatch = {};
    if (pendingRaw.dayBoundaryEndTime !== undefined) patch.dayBoundaryEndTime = pendingRaw.dayBoundaryEndTime;
    if (pendingRaw.timeZone !== undefined) patch.timeZone = pendingRaw.timeZone;
    if (pendingRaw.calendarOpening) patch.calendarOpening = pendingRaw.calendarOpening;
    if (pendingRaw.profileAi) patch.profileAi = pendingRaw.profileAi;
    if (pendingRaw.openStudentTimetableEditor === true) patch.openStudentTimetableEditor = true;

    const applied = await applySettingsPatchFromChat({
      userId: session.user.id,
      entryId: entry.id,
      threadId: thread.id,
      patch,
    });
    if (applied.ok) {
      const nextNotes = { ...notesRaw };
      delete nextNotes.pendingSettingsChange;
      delete nextNotes.lastSettingsProposalSummary;
      delete nextNotes.lastSettingsProposalSummaryJa;
      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { conversationNotes: nextNotes as Prisma.InputJsonValue },
      });
      if (!applied.noPersist) {
        const afterCtx = await getUserEffectiveDayContext(session.user.id, orchestratorNow);
        if (afterCtx.effectiveYmd !== entry.entryDateYmd) {
          navigateToEntryYmd = afterCtx.effectiveYmd;
        }
      }
      if (applied.openTimetableEditorAfterAck) openTimetableEditorAfterAck = true;
      if (applied.noPersist && applied.patchKinds?.includes("openStudentTimetableEditor")) {
        extraSystemAppend = [
          "## 直前の応答（ユーザーが時間割エディタ提案に同意した直後）",
          "ユーザーは時間割をチャットから編集する流れに同意した。アプリがエディタを開く案内を出す想定なので、**長い説明はせず**一言で確認し、この日の振り返りに戻る。",
        ].join("\n");
      } else {
        extraSystemAppend = [
          "## 直前に適用された設定（ユーザーが肯定応答した直後）",
          "ユーザーは提案していた設定変更に同意した。変更内容を**一言**で確認したうえで、",
          "**このエントリ日**の振り返りを続ける。会話がまだ浅ければ、開口に近いトーンでこの日の一日について具体的に聞く（長い設定説明は不要。チップで元に戻せることに触れない）。",
          ...(applied.openTimetableEditorAfterAck
            ? ["時間割エディタを開く案内も出る想定なら、**一文**で触れてよい（長く説明しない）。"]
            : []),
        ].join("\n");
        settingsUndoPayload = { previous: applied.previous, next: applied.next };
      }
    } else {
      extraSystemAppend = `## 設定の適用に失敗\n${applied.errorJa}`;
    }
  }

  const encoder = new TextEncoder();
  let assistantText = "";
  let assistantDisplayed = "";
  /** runOrchestrator 完了後にセット（SSE 内エラーログ突合用） */
  let streamCorrelationId: string | undefined;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        // PERF: runOrchestrator はツールラウンドで十数秒かかることがある。完了待ちの間、
        // HTTP レスポンスをブロックしないようストリーム開始後に実行し、早期フィードバックを送る。
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              phase: "preparing",
              hintJa: "カレンダーや記憶を参照している場合、30秒ほどかかることがあります。",
            })}\n\n`,
          ),
        );

        const {
          stream,
          agentsUsed,
          personaInstructions,
          mbtiHint,
          orchestratorModel,
          correlationId,
        } = await runOrchestrator({
          userId: session.user.id,
          entryId: entry.id,
          entryDateYmd: entry.entryDateYmd,
          userMessage: parsed.data.message,
          historyMessages,
          isOpening: false,
          encryptionMode: entry.encryptionMode,
          currentBody: entry.body,
          reflectiveUserTurnIncludingCurrent,
          preferMiniOrchestrator,
          clockNow: orchestratorNow,
          threadId: thread.id,
          extraSystemAppend,
        });

        streamCorrelationId = correlationId;

        for await (const part of stream) {
          const delta = part.choices[0]?.delta?.content ?? "";
          if (delta) {
            assistantText += delta;
            const { displayedFull, outDelta } = computeAssistantStreamDelta(assistantText, assistantDisplayed);
            assistantDisplayed = displayedFull;
            if (outDelta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: outDelta })}\n\n`));
            }
          }
        }

        const storedAssistant = stripAssistantMetaEchoPrefix(assistantText);
        const latencyMs = Date.now() - started;
        const assistant = await prisma.chatMessage.create({
          data: {
            threadId: thread!.id,
            role: "assistant",
            content: storedAssistant,
            model: orchestratorModel,
            latencyMs,
            tokenEstimate: Math.ceil((parsed.data.message.length + storedAssistant.length) / 4),
            agentName: "orchestrator",
          },
        });
        if (entry.encryptionMode === "STANDARD") {
          void upsertTextEmbedding(session.user.id, "CHAT_MESSAGE", assistant.id, storedAssistant).catch(() => {});
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
              threadId: thread!.id,
              userMessageId: userMsg.id,
              assistantMessageId: assistant.id,
              agentsUsed,
              mas: true,
            },
          },
        });

        const notesBeforeMerge = await prisma.chatThread.findUnique({
          where: { id: thread!.id },
          select: { conversationNotes: true },
        });
        const mergedConversationNotes: Record<string, unknown> = {
          ...((notesBeforeMerge?.conversationNotes as Record<string, unknown>) ?? {}),
          lastExcerpt: parsed.data.message.slice(0, 200),
          updatedAt: new Date().toISOString(),
          lastAgentsUsed: agentsUsed,
        };
        await prisma.chatThread.update({
          where: { id: thread!.id },
          data: { conversationNotes: mergedConversationNotes as Prisma.InputJsonValue },
        });

        const settingsProposalSummary =
          typeof mergedConversationNotes.lastSettingsProposalSummary === "string"
            ? mergedConversationNotes.lastSettingsProposalSummary
            : null;
        const pendRaw = mergedConversationNotes.pendingSettingsChange as Record<string, unknown> | undefined;
        const pendingSettingsSummaryJa =
          pendRaw && typeof pendRaw === "object"
            ? formatPendingSettingsChangeSummaryJa({
                dayBoundaryEndTime: pendRaw.dayBoundaryEndTime as string | null | undefined,
                timeZone: pendRaw.timeZone as string | undefined,
                calendarOpening: pendRaw.calendarOpening as SettingsProposalPatch["calendarOpening"],
                profileAi: pendRaw.profileAi as SettingsProposalPatch["profileAi"],
                openStudentTimetableEditor:
                  pendRaw.openStudentTimetableEditor === true ? true : undefined,
                reasonJa: typeof pendRaw.reasonJa === "string" ? pendRaw.reasonJa : undefined,
              })
            : null;

        const recentTurns = [
          ...historyMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: parsed.data.message },
          { role: "assistant" as const, content: storedAssistant },
        ];

        triggerSupervisorAsync({
          userId: session.user.id,
          threadId: thread!.id,
          agentsUsed,
          recentMessages: [
            ...historyMessages.slice(-4),
            { role: "user", content: parsed.data.message },
            { role: "assistant", content: storedAssistant },
          ],
          personaInstructions,
          mbtiHint: mbtiHint || undefined,
        });

        const secPayload = buildSecurityReviewPayload({
          messageId: assistant.id,
          userId: session.user.id,
          threadId: thread!.id,
          entryId: entry.id,
          userMessage: parsed.data.message,
          assistantContent: storedAssistant,
          agentsUsed,
          settingsProposalSummary,
        });
        if (secPayload) scheduleSecurityReview(secPayload);

        scheduleAppLog(
          AppLogScope.chat,
          "info",
          "orchestrator_chat_sse_complete",
          {
            userId: session.user.id,
            entryId: entry.id,
            threadId: thread!.id,
            entryDateYmd: entry.entryDateYmd,
            latencyMs,
            model: orchestratorModel,
            agentsUsed,
            userMessageChars: parsed.data.message.length,
            assistantChars: storedAssistant.length,
            preferMiniOrchestrator,
          },
          { correlationId },
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              threadId: thread!.id,
              agentsUsed,
              userMessageId: userMsg.id,
              assistantMessageId: assistant.id,
              assistantModel: orchestratorModel,
              assistantSentAt: assistant.updatedAt.toISOString(),
              triggerJournalDraft,
              journalDraftMaterial,
              settingsUndo: settingsUndoPayload,
              navigateToEntryYmd,
              openTimetableEditorAfterAck,
              pendingSettingsSummaryJa: pendingSettingsSummaryJa || undefined,
            })}\n\n`,
          ),
        );

        // PERF: クライアントはストリームの close まで待つため、後処理は待たずにcloseする。
        // 記憶抽出などの重い処理はバックグラウンドに回す（失敗してもチャットの応答性を優先）。
        void (async () => {
          const entryForMemory = await prisma.dailyEntry.findUnique({
            where: { id: entry.id },
            select: { body: true },
          });
          await runMasMemoryExtraction({
            userId: session.user.id,
            entryId: entry.id,
            entryDateYmd: entry.entryDateYmd,
            encryptionMode: entry.encryptionMode,
            diaryBody: entryForMemory?.body ?? entry.body,
            userMessage: parsed.data.message,
            assistantMessage: storedAssistant,
            recentTurns,
          });
        })().catch(() => {});

        controller.close();
      } catch (e) {
        scheduleAppLog(
          AppLogScope.chat,
          "error",
          "orchestrator_chat_sse_error",
          {
            userId: session.user.id,
            entryId: entry.id,
            err: e instanceof Error ? e.message : String(e).slice(0, 500),
          },
          streamCorrelationId ? { correlationId: streamCorrelationId } : undefined,
        );
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
