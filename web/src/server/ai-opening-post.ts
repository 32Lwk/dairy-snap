import type { Prisma } from "@/generated/prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { OPENING_PENDING_MODEL } from "@/lib/opening-pending";
import { prisma } from "@/server/db";
import { claimThreadForOpening } from "@/server/opening-thread-claim";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCalls } from "@/server/usage";
import { runOrchestrator, triggerSupervisorAsync } from "@/server/orchestrator";
import { runMasMemoryExtraction } from "@/server/mas-memory";
import { digestToolFactCards } from "@/lib/tool-fact-card";
import { resolvePolicyVersion, resolvePromptVersion } from "@/server/prompts";
import { upsertTextEmbedding } from "@/server/embeddings";
import { computeAssistantStreamDelta, stripAssistantMetaEchoPrefix } from "@/lib/chat-assistant-sanitize";
import { buildSecurityReviewPayload, scheduleSecurityReview } from "@/server/security-review-queue";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import { resolveOrchestratorClockNow } from "@/lib/time/client-clock";
import { getUserEffectiveDayContext } from "@/lib/server/user-effective-day";
import {
  DEFAULT_DAY_BOUNDARY_END_TIME,
  MAX_DAY_BOUNDARY_END_TIME,
  formatHmInTimeZone,
  hmToMinutes,
  previousCalendarYmdInZone,
} from "@/lib/time/user-day-boundary";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const bodySchema = z.object({
  entryId: z.string().min(1),
  /** クライアントの `new Date().toISOString()`。サーバー時刻から ±12h を超える場合は無視 */
  clientNow: z.string().max(40).optional(),
});

/**
 * 開口（オーケストレータ）POST の本体。
 * `/api/ai/chat/opening` から 127.0.0.1 へ内部 fetch すると本番で不安定になりうるため、ルートはここを直接呼ぶ。
 */
export async function postAiOpening(req: NextRequest): Promise<Response> {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    scheduleAppLog(AppLogScope.opening, "warn", "opening_bad_request", { reason: "body_schema" });
    return jsonResponse({ error: "入力が不正です" }, 400);
  }

  if (!process.env.OPENAI_API_KEY) {
    scheduleAppLog(AppLogScope.opening, "warn", "opening_openai_unconfigured", {});
    return jsonResponse({ error: "OPENAI_API_KEY が未設定です" }, 503);
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { id: parsed.data.entryId, userId: session.user.id },
  });
  if (!entry) {
    scheduleAppLog(AppLogScope.opening, "info", "opening_entry_not_found", { entryId: parsed.data.entryId });
    return jsonResponse({ error: "見つかりません" }, 404);
  }

  const counter = await getTodayCounter(session.user.id);
  if (counter.chatMessages >= LIMITS.CHAT_PER_DAY) {
    scheduleAppLog(AppLogScope.opening, "warn", "opening_rate_limited", { limit: LIMITS.CHAT_PER_DAY });
    return jsonResponse({ error: "本日のチャット上限に達しました" }, 429);
  }

  const claim = await claimThreadForOpening(entry.id);

  if (claim.kind === "skip") {
    scheduleAppLog(AppLogScope.opening, "debug", "opening_skipped_already_done", {
      userId: session.user.id,
      entryId: entry.id,
      threadId: claim.threadId,
    });
    return jsonResponse({ skipped: true, threadId: claim.threadId }, 200);
  }

  if (claim.kind === "in_progress") {
    scheduleAppLog(AppLogScope.opening, "debug", "opening_skipped_in_progress", {
      userId: session.user.id,
      entryId: entry.id,
      threadId: claim.threadId,
    });
    return jsonResponse(
      { skipped: true, threadId: claim.threadId, openingInProgress: true },
      200,
    );
  }

  const threadId = claim.threadId;
  const assistantMessageId = claim.assistantMessageId;

  const started = Date.now();
  const serverNow = new Date();
  const orchestratorNow = resolveOrchestratorClockNow(serverNow, parsed.data.clientNow);
  const streamMode = req.nextUrl.searchParams.get("stream") !== "0";

  const [dayCtx, userMsgCount] = await Promise.all([
    getUserEffectiveDayContext(session.user.id),
    prisma.chatMessage.count({ where: { threadId, role: "user" } }),
  ]);
  const isFirstTurn = userMsgCount === 0;

  const nowHm = formatHmInTimeZone(orchestratorNow, dayCtx.timeZone);
  const nowMin = hmToMinutes(nowHm) ?? 0;
  const maxMin = hmToMinutes(MAX_DAY_BOUNDARY_END_TIME) ?? 180;
  const withinLateNightWindow = nowMin >= 0 && nowMin < maxMin;
  const boundaryMin = hmToMinutes(dayCtx.dayBoundaryEndTime) ?? hmToMinutes(DEFAULT_DAY_BOUNDARY_END_TIME) ?? 0;

  const yesterdayYmd = previousCalendarYmdInZone(dayCtx.calendarYmd, dayCtx.timeZone);
  // PERF: 開口判定のためだけに昨日のメッセージ全文を読むのは重いので、DB側で件数だけ数える。
  // `trim()` 相当まではDBで厳密に判定しない（空文字の user 発話は通常保存されない想定）。
  const yesterdayUserTurns = await prisma.chatMessage.count({
    where: {
      role: "user",
      content: { not: "" },
      thread: {
        entry: {
          userId: session.user.id,
          entryDateYmd: yesterdayYmd,
        },
      },
    },
  });
  // ユーザー要件: 「本文が空」= 昨日のチャットでユーザーが返していない（ユーザー発話0）
  const yesterdayHasReflection = yesterdayUserTurns > 0;

  // ケースA: すでに日付がズレている（boundary により前日扱いで開いている）
  const calendarSplit =
    dayCtx.calendarYmd !== dayCtx.effectiveYmd && entry.entryDateYmd === dayCtx.effectiveYmd;

  // ケースB: 既定が 0:00（=ズレ無し）だが、深夜で「昨日の振り返りが未実施」なら区切り変更を提案してよい
  const isDefaultBoundary = dayCtx.dayBoundaryEndTime === DEFAULT_DAY_BOUNDARY_END_TIME;
  // 追加要件: 区切り時間を少し越えた直後でも「昨日の続きにしたい」ニーズが強いので提案してよい
  // 例: 06:00 区切りで 06:10、昨日未振り返り → 07:00 への繰り上げ提案など
  const smallOverrunAfterBoundaryMin = 30;
  const justAfterBoundary = nowMin >= boundaryMin && nowMin < boundaryMin + smallOverrunAfterBoundaryMin;
  const canExtendBoundary = boundaryMin < maxMin;

  const proposeBecauseYesterdayMissing =
    withinLateNightWindow &&
    entry.entryDateYmd === dayCtx.calendarYmd &&
    !yesterdayHasReflection &&
    (isDefaultBoundary || (canExtendBoundary && justAfterBoundary));

  const proposeBoundaryFromNow = (() => {
    // 00:00〜(MAX-1) のみ。次の「ちょうど1時間」へ切り上げ（最大 MAX）。
    if (!withinLateNightWindow) return null;
    const maxHour = Math.max(1, Math.floor(maxMin / 60));
    const nextHour = Math.min(maxHour, Math.max(1, Math.ceil(nowMin / 60)));
    return `${String(nextHour).padStart(2, "0")}:00`;
  })();

  // 「まだ寝ていない」寄りの時間帯。提案を優先してよい（ただし boundary 直後の小超過も含む）。
  const likelyAwakeWindow = (nowMin >= 30 && nowMin < maxMin) || justAfterBoundary;

  const openingAllowSettingsTool = isFirstTurn && (calendarSplit || proposeBecauseYesterdayMissing);

  const openingShouldAskSettingsFirst =
    isFirstTurn && proposeBecauseYesterdayMissing && likelyAwakeWindow && Boolean(proposeBoundaryFromNow);

  // ツール呼び出しは LLM の裁量でスキップされることがあるため、
  // 条件が強いケース（「昨日のユーザー発話が0」+深夜+既定0:00）ではサーバー側で先に保留を保存して確実に提案する。
  if (openingShouldAskSettingsFirst && proposeBoundaryFromNow) {
    const trow = await prisma.chatThread.findUnique({
      where: { id: threadId },
      select: { conversationNotes: true },
    });
    const notes = (trow?.conversationNotes as Record<string, unknown>) ?? {};
    await prisma.chatThread.update({
      where: { id: threadId },
      data: {
        conversationNotes: {
          ...notes,
          pendingSettingsChange: {
            dayBoundaryEndTime: proposeBoundaryFromNow,
            reasonJa: "深夜に昨日の振り返りをしやすくするため",
            proposedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  // 提案優先フラグが立っている開口では、振り返りを並列に始めず「提案→ユーザー返答待ち」だけを返す。
  if (openingShouldAskSettingsFirst && proposeBoundaryFromNow) {
    const msg = [
      `まだ${nowHm}で夜中だけど、昨日（${yesterdayYmd}）の振り返りがまだ無さそう。`,
      `日付の区切りを **${proposeBoundaryFromNow}** にして、「まだ昨日の続き」として振り返れるようにしておく？`,
      "よければ「はい」か「いいえ」で教えてください。",
    ].join("\n");

    await prisma.chatMessage.update({
      where: { id: assistantMessageId },
      data: {
        content: msg,
        model: "rule_based_opening",
        latencyMs: Date.now() - started,
        tokenEstimate: Math.ceil(msg.length / 4),
      },
    });

    const latencyMs = Date.now() - started;
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        entryId: entry.id,
        action: "ai_orchestrator_opening_complete",
        metadata: {
          threadId,
          model: "rule_based_opening",
          latencyMs,
          agentsUsed: ["rule_based_settings_prompt"],
          promptVersion: resolvePromptVersion("reflective_chat"),
          policyVersion: resolvePolicyVersion("opening_default"),
        },
      },
    });

    await prisma.aIArtifact.create({
      data: {
        userId: session.user.id,
        entryId: entry.id,
        kind: "CHAT_MESSAGE",
        promptVersion: resolvePromptVersion("reflective_chat"),
        policyVersion: resolvePolicyVersion("opening_default"),
        model: "rule_based_opening",
        latencyMs,
        tokenEstimate: Math.ceil(msg.length / 4),
        metadata: {
          threadId,
          assistantMessageId,
          mas: true,
          ruleBased: true,
          pendingSettings: {
            dayBoundaryEndTime: proposeBoundaryFromNow,
            reasonJa: "深夜に昨日の振り返りをしやすくするため",
          },
        },
      },
    });

    return jsonResponse({ skipped: true, threadId }, 200);
  }

  const openingExtraAppend = openingAllowSettingsTool
    ? [
        "## ルールベース（開口・日付の区切り提案）",
        `壁時計: ${dayCtx.calendarYmd} ${nowHm}（${dayCtx.timeZone}）`,
        `このスレッドのエントリ日: ${entry.entryDateYmd}`,
        calendarSplit
          ? `いまカレンダー上は **${dayCtx.calendarYmd}** が「今日」だが、このエントリ日は **${dayCtx.effectiveYmd}**（区切り設定のため「まだ前日の続き」）。`
          : "",
        proposeBecauseYesterdayMissing
          ? `深夜帯で、${yesterdayYmd} の振り返りでユーザー発話がまだ無い。日付の区切りを **${proposeBoundaryFromNow ?? MAX_DAY_BOUNDARY_END_TIME}** に変更して「まだ昨日の続き」にできる提案をしてよい。`
          : "",
        "ユーザー発言はまだない。次から自然に選べる（2〜3文以内）:",
        proposeBecauseYesterdayMissing && likelyAwakeWindow
          ? "優先: まず区切り変更の提案 → 同意が取れそうなら `propose_settings_change` で**提案の保留だけ**（このターン適用しない）。その後に昨日の振り返りを開始する。"
          : "",
        proposeBecauseYesterdayMissing && likelyAwakeWindow && proposeBoundaryFromNow
          ? `この条件ではサーバー側で保留（pending）を先に保存している場合がある。ユーザーには「区切りを ${proposeBoundaryFromNow} に変更しますか？」と短く確認する。`
          : "",
        "1) このエントリ日の振り返りを始める（天気・予定・本文から一文で声をかける）",
        "2) ユーザーが日付のズレ/未振り返りに困りそうなら、区切り時刻の変更を短く提案し、同意が取れそうなら `propose_settings_change` で**提案の保留だけ**行う（このターンでは適用しない）",
        proposeBecauseYesterdayMissing
          ? `提案パッチ例: { dayBoundaryEndTime: \"${proposeBoundaryFromNow ?? MAX_DAY_BOUNDARY_END_TIME}\", reasonJa: \"深夜に昨日の振り返りをしやすくするため\" }`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const {
    stream,
    agentsUsed,
    personaInstructions,
    mbtiHint,
    orchestratorModel,
    correlationId,
    policyVersion,
    toolFactCards,
  } = await runOrchestrator({
    userId: session.user.id,
    entryId: entry.id,
    entryDateYmd: entry.entryDateYmd,
    userMessage: "",
    historyMessages: [],
    isOpening: true,
    encryptionMode: entry.encryptionMode,
    currentBody: entry.body,
    clockNow: orchestratorNow,
    threadId,
    extraSystemAppend: openingExtraAppend,
    openingAllowSettingsTool,
  });

  const toolCardsDigest = digestToolFactCards(toolFactCards);

  const encoder = new TextEncoder();
  let assistantText = "";
  let assistantDisplayed = "";
  const abortSignal = req.signal;

  if (!streamMode) {
    try {
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content ?? "";
        if (delta) assistantText += delta;
      }

      const storedAssistant = stripAssistantMetaEchoPrefix(assistantText);
      const latencyMs = Date.now() - started;
      const assistant = await prisma.chatMessage.update({
        where: { id: assistantMessageId },
        data: {
          content: storedAssistant,
          model: orchestratorModel,
          latencyMs,
          tokenEstimate: Math.ceil(storedAssistant.length / 4),
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
          action: "ai_orchestrator_opening_complete",
          metadata: {
            threadId,
            model: orchestratorModel,
            latencyMs,
            agentsUsed,
            promptVersion: resolvePromptVersion("reflective_chat"),
            policyVersion,
            toolCardsDigest,
          },
        },
      });

      await prisma.aIArtifact.create({
        data: {
          userId: session.user.id,
          entryId: entry.id,
          kind: "CHAT_MESSAGE",
          promptVersion: resolvePromptVersion("reflective_chat"),
          policyVersion: resolvePolicyVersion("opening_default"),
          model: orchestratorModel,
          latencyMs,
          tokenEstimate: assistant.tokenEstimate,
          metadata: {
            threadId,
            assistantMessageId: assistant.id,
            agentsUsed,
            mas: true,
            isOpening: true,
            streamMode: "json_fallback",
          },
        },
      });

      void prisma.turnContextSnapshot
        .create({
          data: {
            userId: session.user.id,
            threadId,
            entryId: entry.id,
            userMessageId: null,
            assistantMessageId: assistant.id,
            promptVersion: resolvePromptVersion("reflective_chat"),
            policyVersion,
            toolCardsJson: toolFactCards as unknown as Prisma.InputJsonValue,
            digest: toolCardsDigest,
          },
        })
        .catch(() => {});

      triggerSupervisorAsync({
        userId: session.user.id,
        threadId,
        agentsUsed,
        recentMessages: [{ role: "assistant", content: storedAssistant }],
        personaInstructions,
        mbtiHint: mbtiHint || undefined,
      });

      const tNotes = await prisma.chatThread.findUnique({
        where: { id: threadId },
        select: { conversationNotes: true },
      });
      const cn = (tNotes?.conversationNotes as Record<string, unknown>) ?? {};
      const settingsProposalSummary =
        typeof cn.lastSettingsProposalSummary === "string" ? cn.lastSettingsProposalSummary : null;

      const secPayload = buildSecurityReviewPayload({
        messageId: assistant.id,
        userId: session.user.id,
        threadId,
        entryId: entry.id,
        userMessage: "",
        assistantContent: storedAssistant,
        agentsUsed,
        settingsProposalSummary,
      });
      if (secPayload) scheduleSecurityReview(secPayload);

      scheduleAppLog(
        AppLogScope.opening,
        "info",
        "opening_json_complete",
        {
          userId: session.user.id,
          entryId: entry.id,
          threadId,
          entryDateYmd: entry.entryDateYmd,
          latencyMs,
          model: orchestratorModel,
          agentsUsed,
          assistantChars: storedAssistant.length,
          promptVersion: resolvePromptVersion("reflective_chat"),
          policyVersion,
          toolCardsDigest,
        },
        { correlationId },
      );

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
          userMessage: "",
          assistantMessage: storedAssistant,
          recentTurns: [{ role: "assistant" as const, content: storedAssistant }],
        });
      })().catch(() => {});

      return jsonResponse({ threadId, assistant: storedAssistant, model: orchestratorModel }, 200);
    } catch (e) {
      scheduleAppLog(
        AppLogScope.opening,
        "error",
        "opening_json_error",
        {
          userId: session.user.id,
          entryId: entry.id,
          threadId,
          assistantMessageId,
          err: e instanceof Error ? e.message : String(e).slice(0, 500),
        },
        { correlationId },
      );
      await prisma.chatMessage
        .deleteMany({
          where: { id: assistantMessageId, model: OPENING_PENDING_MODEL },
        })
        .catch(() => {});
      return jsonResponse({ error: "開口メッセージの生成に失敗しました" }, 500);
    }
  }

  const readable = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      };
      try {
        for await (const part of stream) {
          if (abortSignal.aborted) {
            scheduleAppLog(
              AppLogScope.opening,
              "info",
              "opening_sse_aborted_by_client",
              { userId: session.user.id, entryId: entry.id, threadId },
              { correlationId },
            );
            safeClose();
            return;
          }
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
        const assistant = await prisma.chatMessage.update({
          where: { id: assistantMessageId },
          data: {
            content: storedAssistant,
            model: orchestratorModel,
            latencyMs,
            tokenEstimate: Math.ceil(storedAssistant.length / 4),
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
            action: "ai_orchestrator_opening_complete",
            metadata: {
              threadId,
              model: orchestratorModel,
              latencyMs,
              agentsUsed,
              promptVersion: resolvePromptVersion("reflective_chat"),
              policyVersion,
              toolCardsDigest,
            },
          },
        });

        await prisma.aIArtifact.create({
          data: {
            userId: session.user.id,
            entryId: entry.id,
            kind: "CHAT_MESSAGE",
            promptVersion: resolvePromptVersion("reflective_chat"),
            policyVersion: resolvePolicyVersion("opening_default"),
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

        void prisma.turnContextSnapshot
          .create({
            data: {
              userId: session.user.id,
              threadId,
              entryId: entry.id,
              userMessageId: null,
              assistantMessageId: assistant.id,
              promptVersion: resolvePromptVersion("reflective_chat"),
              policyVersion,
              toolCardsJson: toolFactCards as unknown as Prisma.InputJsonValue,
              digest: toolCardsDigest,
            },
          })
          .catch(() => {});

        triggerSupervisorAsync({
          userId: session.user.id,
          threadId,
          agentsUsed,
          recentMessages: [{ role: "assistant", content: storedAssistant }],
          personaInstructions,
          mbtiHint: mbtiHint || undefined,
        });

        const tNotes = await prisma.chatThread.findUnique({
          where: { id: threadId },
          select: { conversationNotes: true },
        });
        const cn = (tNotes?.conversationNotes as Record<string, unknown>) ?? {};
        const settingsProposalSummary =
          typeof cn.lastSettingsProposalSummary === "string" ? cn.lastSettingsProposalSummary : null;

        const secPayload = buildSecurityReviewPayload({
          messageId: assistant.id,
          userId: session.user.id,
          threadId,
          entryId: entry.id,
          userMessage: "",
          assistantContent: storedAssistant,
          agentsUsed,
          settingsProposalSummary,
        });
        if (secPayload) scheduleSecurityReview(secPayload);

        scheduleAppLog(
          AppLogScope.opening,
          "info",
          "opening_sse_complete",
          {
            userId: session.user.id,
            entryId: entry.id,
            threadId,
            entryDateYmd: entry.entryDateYmd,
            latencyMs,
            model: orchestratorModel,
            agentsUsed,
            assistantChars: storedAssistant.length,
            promptVersion: resolvePromptVersion("reflective_chat"),
            policyVersion,
            toolCardsDigest,
          },
          { correlationId },
        );

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, threadId, agentsUsed })}\n\n`),
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
            userMessage: "",
            assistantMessage: storedAssistant,
            recentTurns: [{ role: "assistant" as const, content: storedAssistant }],
          });
        })().catch(() => {});

        safeClose();
      } catch (e) {
        scheduleAppLog(
          AppLogScope.opening,
          "error",
          "opening_sse_error",
          {
            userId: session.user.id,
            entryId: entry.id,
            threadId,
            assistantMessageId,
            err: e instanceof Error ? e.message : String(e).slice(0, 500),
          },
          { correlationId },
        );
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
      "X-Accel-Buffering": "no",
      "X-Correlation-Id": correlationId,
    },
  });
}
