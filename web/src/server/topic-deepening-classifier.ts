/**
 * 深掘りモードの LLM 二値分類。`runOrchestrator` 内で天気・カレンダー取得と Promise.all 並列化し、
 * 壁時計への追加を抑える（逐次 await はしない）。
 *
 * 無効化: `TOPIC_DEEPENING_CLASSIFIER_ENABLED=false` または `OPENAI_TOPIC_DEEPENING_CLASSIFIER_MODEL=none`
 */

import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getTopicDeepeningClassifierChatFallbackModel,
  getTopicDeepeningClassifierChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import type { JournalDraftMaterialTier } from "@/lib/reflective-chat-diary-nudge-rules";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";

export function isTopicDeepeningClassifierEnabled(): boolean {
  const off = process.env.TOPIC_DEEPENING_CLASSIFIER_ENABLED?.trim().toLowerCase();
  if (off === "0" || off === "false" || off === "off" || off === "no") return false;
  if (!process.env.OPENAI_API_KEY?.trim()) return false;
  return getTopicDeepeningClassifierChatModel() !== null;
}

const SYSTEM = [
  "You are a classifier for a Japanese reflective diary chat companion.",
  'Decide if THIS turn should use "topic deepening" mode: better know the user, memory-worthy light questions, hobby/news hooks before a diary draft — even when calendar is empty.',
  "",
  "Return JSON only: {\"topicDeepening\":true|false}",
  "",
  "When genuinely uncertain, choose **false** (avoid unnecessary deepening, extra tools, and long replies).",
  "",
  "Prefer **true** when:",
  "- Natural pause before wrapping up / moving to diary draft",
  "- Conversation feels stuck, thin, or repetitive",
  "- User seems unsure what to talk about",
  "- Good moment for one more meaningful angle without being pushy",
  "",
  "Prefer **false** when:",
  "- User mid-urgent crisis needing immediate short support",
  "- User just opened a brand-new deep topic and one short follow-up is enough",
  "- Pure ack / closing (ありがとう、おやすみ) with no deepening signal",
].join("\n");

function buildTranscript(
  historyMessages: { role: string; content: string }[],
  userMessage: string,
  maxChars: number,
): string {
  const lines: string[] = [];
  const tail = historyMessages.slice(-10);
  for (const m of tail) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const role = m.role === "user" ? "user" : "assistant";
    lines.push(`[${role}] ${m.content.trim()}`);
  }
  lines.push(`[user] ${userMessage.trim()}`);
  let s = lines.join("\n");
  if (s.length > maxChars) s = s.slice(-maxChars);
  return s;
}

/**
 * ルールベースで既に深掘りなら呼ばない想定（LLM 省略）。並列 I/O と同時実行する。
 */
export async function classifyTopicDeepeningParallel(args: {
  skip: boolean;
  userMessage: string;
  historyMessages: { role: string; content: string }[];
  reflectiveUserTurnIncludingCurrent: number;
  diaryProposalMinUserTurns: number;
  materialTier: JournalDraftMaterialTier;
  correlationId: string;
}): Promise<boolean> {
  if (args.skip || !isTopicDeepeningClassifierEnabled()) return false;

  const primary = getTopicDeepeningClassifierChatModel();
  if (!primary) return false;

  const transcript = buildTranscript(args.historyMessages, args.userMessage, 3600);
  const userBlock = [
    `Counted user turns including this message: ${args.reflectiveUserTurnIncludingCurrent}`,
    `Persona diary-draft threshold (min user turns): ${args.diaryProposalMinUserTurns}`,
    `Journal material tier (classifier): ${args.materialTier}`,
    "",
    "## Recent transcript",
    transcript,
  ].join("\n");

  try {
    const openai = getOpenAI();
    const completion = await withChatModelFallback(
      primary,
      getTopicDeepeningClassifierChatFallbackModel(),
      (model) =>
        openai.chat.completions.create({
          model,
          ...chatCompletionOutputTokenLimit(model, 96),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userBlock },
          ],
        }),
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { topicDeepening?: unknown } = {};
    try {
      parsed = JSON.parse(raw) as { topicDeepening?: unknown };
    } catch {
      parsed = {};
    }
    const v = parsed.topicDeepening === true;
    scheduleAppLog(AppLogScope.chat, "debug", "topic_deepening_classifier", {
      topicDeepening: v,
      correlationId: args.correlationId,
    });
    return v;
  } catch (e) {
    scheduleAppLog(AppLogScope.chat, "warn", "topic_deepening_classifier_error", {
      message: String(e).slice(0, 200),
      correlationId: args.correlationId,
    });
    return false;
  }
}
