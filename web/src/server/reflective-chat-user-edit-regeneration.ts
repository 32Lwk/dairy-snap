import type { Prisma } from "@/generated/prisma/client";
import { digestToolFactCards } from "@/lib/tool-fact-card";
import { stripAssistantMetaEchoPrefix } from "@/lib/chat-assistant-sanitize";
import {
  classifyJournalDraftMaterial,
  countUserTurnsIncludingCurrent,
} from "@/lib/reflective-chat-diary-nudge-rules";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { resolvePromptVersion } from "@/server/prompts";
import { upsertTextEmbedding } from "@/server/embeddings";
import { runOrchestrator, triggerSupervisorAsync } from "@/server/orchestrator";
import { runMasMemoryExtraction } from "@/server/mas-memory";
import { LIMITS, getTodayCounter, incrementChat, incrementOrchestratorCalls } from "@/server/usage";
import { buildSecurityReviewPayload, scheduleSecurityReview } from "@/server/security-review-queue";
import { scheduleConversationEvalSampleInsert } from "@/server/eval/conversation-eval-sample";

export type ReflectiveChatRegenerateResult = {
  removedFollowingCount: number;
  assistant: { id: string; content: string; model: string | null; sentAt: string };
};

/**
 * Deletes all messages after `editedUserMessageId` in the thread, then runs one orchestrator turn
 * using history strictly before that message and the edited user line as the latest input.
 */
export async function regenerateReflectiveChatTail(args: {
  userId: string;
  editedUserMessageId: string;
  threadId: string;
  entry: { id: string; entryDateYmd: string; encryptionMode: string; body: string };
}): Promise<ReflectiveChatRegenerateResult> {
  const { userId, editedUserMessageId, threadId, entry } = args;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY が未設定です");
  }

  const counter = await getTodayCounter(userId);
  if (counter.chatMessages >= LIMITS.CHAT_PER_DAY) {
    throw new Error("本日のチャット上限に達しました");
  }

  const ordered = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });

  const idx = ordered.findIndex((m) => m.id === editedUserMessageId);
  if (idx < 0) throw new Error("message_not_in_thread");

  const editedRow = ordered[idx]!;
  if (editedRow.role !== "user") {
    throw new Error("edited_not_user");
  }

  const tail = ordered.slice(idx + 1);
  const removedFollowingCount = tail.length;
  if (removedFollowingCount === 0) {
    throw new Error("nothing_to_regenerate");
  }

  await prisma.chatMessage.deleteMany({
    where: { id: { in: tail.map((m) => m.id) } },
  });

  const historyRows = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const chatPairs = historyRows.filter((m) => m.role === "user" || m.role === "assistant");
  const last = chatPairs[chatPairs.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("invalid_history_tail");
  }
  const latestUserText = last.content;
  const historyMessages = chatPairs.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const reflectiveUserTurnIncludingCurrent = countUserTurnsIncludingCurrent(historyMessages);

  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true, evaluationFullLogOptIn: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;
  const journalDraftMaterial = classifyJournalDraftMaterial(
    chatPairs.map((m) => ({ role: m.role, content: m.content })),
    { aiDepthLevel: profile?.aiDepthLevel, aiChatTone: profile?.aiChatTone },
  );

  const started = Date.now();
  const { stream, agentsUsed, personaInstructions, mbtiHint, orchestratorModel, policyVersion, toolFactCards } =
    await runOrchestrator({
    userId,
    entryId: entry.id,
    entryDateYmd: entry.entryDateYmd,
    userMessage: latestUserText,
    historyMessages,
    isOpening: false,
    encryptionMode: entry.encryptionMode,
    currentBody: entry.body,
    reflectiveUserTurnIncludingCurrent,
    reflectiveJournalMaterialTier: journalDraftMaterial.tier,
    clockNow: new Date(),
  });

  let assistantText = "";
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content ?? "";
    if (delta) assistantText += delta;
  }

  const storedAssistant = stripAssistantMetaEchoPrefix(assistantText);
  const latencyMs = Date.now() - started;

  const assistant = await prisma.chatMessage.create({
    data: {
      threadId,
      role: "assistant",
      content: storedAssistant,
      model: orchestratorModel,
      latencyMs,
      tokenEstimate: Math.ceil((latestUserText.length + storedAssistant.length) / 4),
      agentName: "orchestrator",
    },
  });

  if (entry.encryptionMode === "STANDARD") {
    void upsertTextEmbedding(userId, "CHAT_MESSAGE", assistant.id, storedAssistant).catch(() => {});
  }

  await incrementChat(userId);
  await incrementOrchestratorCalls(userId);

  await prisma.auditLog.create({
    data: {
      userId,
      entryId: entry.id,
      action: "ai_orchestrator_chat_after_user_edit",
      metadata: {
        threadId,
        model: orchestratorModel,
        latencyMs,
        agentsUsed,
        promptVersion: resolvePromptVersion("reflective_chat"),
        policyVersion,
        editedUserMessageId,
        removedFollowingCount,
      },
    },
  });

  const toolCardsDigest = digestToolFactCards(toolFactCards);
  void prisma.turnContextSnapshot
    .create({
      data: {
        userId,
        threadId,
        entryId: entry.id,
        userMessageId: editedUserMessageId,
        assistantMessageId: assistant.id,
        promptVersion: resolvePromptVersion("reflective_chat"),
        policyVersion,
        toolCardsJson: toolFactCards as unknown as Prisma.InputJsonValue,
        digest: toolCardsDigest,
      },
    })
    .catch(() => {});

  if (userRow?.evaluationFullLogOptIn === true && entry.encryptionMode === "STANDARD") {
    scheduleConversationEvalSampleInsert({
      userId,
      threadId,
      userMessageId: editedUserMessageId,
      assistantMessageId: assistant.id,
      promptVersion: resolvePromptVersion("reflective_chat"),
      policyVersion,
      userContent: latestUserText,
      assistantContent: storedAssistant,
    });
  }

  await prisma.aIArtifact.create({
    data: {
      userId,
      entryId: entry.id,
      kind: "CHAT_MESSAGE",
      promptVersion: resolvePromptVersion("reflective_chat"),
      policyVersion,
      model: orchestratorModel,
      latencyMs,
      tokenEstimate: assistant.tokenEstimate,
      metadata: {
        threadId,
        assistantMessageId: assistant.id,
        agentsUsed,
        mas: true,
        afterUserEditRegeneration: true,
      },
    },
  });

  const threadRow = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { conversationNotes: true },
  });
  const prevNotes = (threadRow?.conversationNotes as Record<string, unknown>) ?? {};
  const settingsProposalSummary =
    typeof prevNotes.lastSettingsProposalSummary === "string" ? prevNotes.lastSettingsProposalSummary : null;

  await prisma.chatThread.update({
    where: { id: threadId },
    data: {
      conversationNotes: {
        ...prevNotes,
        lastExcerpt: latestUserText.slice(0, 200),
        updatedAt: new Date().toISOString(),
        lastAgentsUsed: agentsUsed,
      },
    },
  });

  triggerSupervisorAsync({
    userId,
    threadId,
    agentsUsed,
    recentMessages: [
      ...historyMessages.slice(-4),
      { role: "user", content: latestUserText },
      { role: "assistant", content: storedAssistant },
    ],
    personaInstructions,
    mbtiHint: mbtiHint || undefined,
  });

  const secPayload = buildSecurityReviewPayload({
    messageId: assistant.id,
    userId,
    threadId,
    entryId: entry.id,
    userMessage: latestUserText,
    assistantContent: storedAssistant,
    agentsUsed,
    settingsProposalSummary,
  });
  if (secPayload) scheduleSecurityReview(secPayload);

  const entryForMemory = await prisma.dailyEntry.findUnique({
    where: { id: entry.id },
    select: { body: true },
  });

  const recentTurns = [
    ...historyMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: latestUserText },
    { role: "assistant" as const, content: storedAssistant },
  ];

  void runMasMemoryExtraction({
    userId,
    entryId: entry.id,
    entryDateYmd: entry.entryDateYmd,
    encryptionMode: entry.encryptionMode,
    diaryBody: entryForMemory?.body ?? entry.body,
    userMessage: latestUserText,
    assistantMessage: storedAssistant,
    recentTurns,
  }).catch(() => {});

  return {
    removedFollowingCount,
    assistant: {
      id: assistant.id,
      content: storedAssistant,
      model: assistant.model,
      sentAt: assistant.updatedAt.toISOString(),
    },
  };
}
