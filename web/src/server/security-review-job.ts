import { z } from "zod";
import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getSecurityAgentChatFallbackModel,
  getSecurityAgentChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallbackAndModel } from "@/lib/ai/openai-model-fallback";
import { loadAgentPrompt } from "@/server/agents/utils";
import { prisma } from "@/server/db";
import { EncryptionMode } from "@/generated/prisma/enums";

const llmOutputSchema = z.object({
  severity: z.enum(["none", "low", "medium", "high"]),
  categories: z.array(z.string()).default([]),
  userFacingSummaryJa: z.string().default(""),
  internalNote: z.string().default(""),
});

export type SecurityReviewJobPayload = {
  messageId: string;
  userId: string;
  threadId: string;
  entryId: string;
  runLlm: boolean;
  syncRuleTags: string[];
};

function excerpt(text: string, head: number, tail: number): string {
  const t = text.trim();
  if (t.length <= head + tail + 8) return t;
  return `${t.slice(0, head)} … ${t.slice(-tail)}`;
}

const HIGH_REPLACEMENT_TEMPLATE = (reason: string) =>
  [
    "申し訳ありません。自動チェックの結果、このメッセージの表示を差し替えました。続きは通常どおりお話しください。",
    "",
    `（理由: ${reason.slice(0, 200)}）`,
  ].join("\n");

const MEDIUM_NOTICE_DEFAULT =
  "内容を軽く確認しました。気になる点があれば、該当メッセージを編集または削除してください。";

export async function runSecurityReviewJob(payload: SecurityReviewJobPayload): Promise<void> {
  const existing = await prisma.securityReview.findUnique({
    where: { messageId: payload.messageId },
  });
  if (existing) return;

  const message = await prisma.chatMessage.findFirst({
    where: { id: payload.messageId, threadId: payload.threadId },
    include: {
      thread: {
        include: {
          entry: { select: { id: true, userId: true, encryptionMode: true } },
        },
      },
    },
  });
  if (!message || message.role !== "assistant") return;
  const entry = message.thread.entry;
  if (!entry || entry.userId !== payload.userId || entry.id !== payload.entryId) return;

  const e2ee = entry.encryptionMode === EncryptionMode.EXPERIMENTAL_E2EE;
  let llmInvoked = false;
  let modelUsed: string | null = null;
  let parsed = {
    severity: "none" as z.infer<typeof llmOutputSchema>["severity"],
    categories: [] as string[],
    userFacingSummaryJa: "",
    internalNote: "",
  };

  const runLlmEffective = payload.runLlm && !e2ee && !!process.env.OPENAI_API_KEY;

  if (runLlmEffective) {
    const recent = await prisma.chatMessage.findMany({
      where: { threadId: payload.threadId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });
    recent.reverse();
    const transcript = recent
      .map((m) => `[${m.role}] ${excerpt(m.content, 200, 80)}`)
      .join("\n");

    const system = loadAgentPrompt("security-reviewer");
    const userBlock = [
      `## syncRuleTags (from server hot path)\n${JSON.stringify(payload.syncRuleTags)}`,
      `## assistant excerpt (messageId=${payload.messageId})\n${excerpt(message.content, 500, 200)}`,
      "## recent_turns_excerpts",
      transcript || "(none)",
    ].join("\n\n");

    try {
      const openai = getOpenAI();
      const primary = getSecurityAgentChatModel();
      const fallback = getSecurityAgentChatFallbackModel();
      const { result: completion, model } = await withChatModelFallbackAndModel(
        primary,
        fallback,
        (m) =>
          openai.chat.completions.create({
            model: m,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: userBlock },
            ],
            ...chatCompletionOutputTokenLimit(m, 400),
          }),
      );
      modelUsed = model;
      llmInvoked = true;
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let j: unknown = {};
      try {
        j = JSON.parse(raw) as unknown;
      } catch {
        j = {};
      }
      parsed = llmOutputSchema.parse(j);
    } catch (e) {
      parsed = {
        severity: "low",
        categories: ["llm_error"],
        userFacingSummaryJa: "",
        internalNote: `openai_or_parse_error: ${String(e).slice(0, 200)}`,
      };
    }
  } else {
    parsed.internalNote = e2ee
      ? "skipped_llm_e2ee"
      : !process.env.OPENAI_API_KEY
        ? "skipped_llm_no_openai_key"
        : "skipped_llm_by_policy";
    if (payload.syncRuleTags.includes("secret_like")) {
      parsed.severity = "medium";
      parsed.categories = ["secret_like"];
      parsed.userFacingSummaryJa =
        "シークレットに見える文字列が含まれていました。意図しない公開でないか、内容の編集を検討してください。";
    } else if (payload.syncRuleTags.length > 0) {
      parsed.severity = "medium";
      parsed.categories = [...payload.syncRuleTags];
      parsed.userFacingSummaryJa = MEDIUM_NOTICE_DEFAULT;
    }
  }

  // Never auto-high from rules only (avoid false positives).
  if (!llmInvoked && parsed.severity === "high") {
    parsed = { ...parsed, severity: "medium", internalNote: `${parsed.internalNote} downgraded_rule_only`.trim() };
  }

  let replacedContent = false;
  try {
    await prisma.$transaction(async (tx) => {
    if (parsed.severity === "high") {
      const reason =
        parsed.userFacingSummaryJa?.trim() || parsed.internalNote?.trim() || "自動チェックにより";
      const nextContent = HIGH_REPLACEMENT_TEMPLATE(reason);
      await tx.chatMessage.update({
        where: { id: payload.messageId },
        data: { content: nextContent },
      });
      replacedContent = true;
    } else if (parsed.severity === "medium") {
      const thread = await tx.chatThread.findUnique({ where: { id: payload.threadId } });
      const notes = (thread?.conversationNotes as Record<string, unknown>) ?? {};
      const notice = parsed.userFacingSummaryJa?.trim() || MEDIUM_NOTICE_DEFAULT;
      await tx.chatThread.update({
        where: { id: payload.threadId },
        data: {
          conversationNotes: {
            ...notes,
            securityNoticeJa: notice,
            securityNoticeAt: new Date().toISOString(),
          },
        },
      });
    }

    await tx.securityReview.create({
      data: {
        messageId: payload.messageId,
        userId: payload.userId,
        threadId: payload.threadId,
        entryId: payload.entryId,
        severity: parsed.severity,
        categories: parsed.categories,
        model: modelUsed,
        userFacingSummaryJa: parsed.userFacingSummaryJa || null,
        internalNote: parsed.internalNote || null,
        syncRuleTags: payload.syncRuleTags,
        llmInvoked,
        replacedContent,
      },
    });
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "P2002") return;
    throw e;
  }

  if (parsed.severity === "high" || parsed.severity === "medium") {
    await prisma.auditLog.create({
      data: {
        userId: payload.userId,
        entryId: payload.entryId,
        action: "security_review_action",
        metadata: {
          messageId: payload.messageId,
          severity: parsed.severity,
          replacedContent,
          categories: parsed.categories,
        },
      },
    });
  }
}
