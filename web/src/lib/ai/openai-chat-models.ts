/**
 * Pinned Chat Completions model IDs (dated snapshots). Prefer these over aliases in production.
 * Override any value with the documented env vars. For fallbacks, empty string or "none" disables retry.
 */

export const OPENAI_CHAT_MODEL_SNAPSHOT = {
  orchestratorAgentsMetaMemoryJournal: "gpt-5.4-2026-03-05",
  calendarSocialOnly: "gpt-5.4-mini-2026-03-17",
  calendarAutoClassifyOpenAi: "gpt-5.4-mini-2026-03-17",
} as const;

/** When the primary snapshot is unavailable on the account. */
export const OPENAI_CHAT_MODEL_FALLBACK_DEFAULT = {
  reasoning: "gpt-4o",
  socialMini: "gpt-4o-mini",
  calendarClassify: "gpt-4o-mini",
} as const;

function envFallbackOrDefault(envKey: string, defaultFallback: string): string | null {
  const raw = process.env[envKey];
  if (raw !== undefined) {
    const t = raw.trim();
    if (t === "" || /^none$/i.test(t)) return null;
    return t;
  }
  return defaultFallback;
}

export function getOrchestratorChatModel(): string {
  return process.env.OPENAI_ORCHESTRATOR_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.orchestratorAgentsMetaMemoryJournal;
}

export function getOrchestratorChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_ORCHESTRATOR_FALLBACK_MODEL",
    OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning,
  );
}

/** Opening-only model; defaults to main orchestrator when env unset. */
export function getOrchestratorOpeningChatModel(): string {
  const o = process.env.OPENAI_ORCHESTRATOR_OPENING_MODEL?.trim();
  return o || getOrchestratorChatModel();
}

export function getOrchestratorOpeningChatFallbackModel(): string | null {
  const raw = process.env.OPENAI_ORCHESTRATOR_OPENING_FALLBACK_MODEL;
  if (raw !== undefined) {
    const t = raw.trim();
    if (t === "" || /^none$/i.test(t)) return null;
    return t;
  }
  return getOrchestratorChatFallbackModel();
}

/**
 * 開口ターンのみ Chat Completions の sampling をやや下げる（指示追従の安定化）。
 * - 未設定: `0.72`
 * - `OPENAI_ORCHESTRATOR_OPENING_TEMPERATURE=` 空または `omit`: API 既定（指定しない）
 * - gpt-5 / o 系は多くの場合 temperature 固定のため {@link orchestratorOpeningSamplingParams} で除外
 */
export function getOrchestratorOpeningTemperature(): number | undefined {
  const raw = process.env.OPENAI_ORCHESTRATOR_OPENING_TEMPERATURE;
  if (raw === undefined) return 0.72;
  const t = raw.trim();
  if (t === "" || /^omit$/i.test(t)) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0.72;
  return Math.min(2, Math.max(0, n));
}

/** 開口時のみ `temperature` を付与できるモデルに限定（未対応モデルは空オブジェクト）。 */
export function orchestratorOpeningSamplingParams(model: string): { temperature?: number } {
  const temp = getOrchestratorOpeningTemperature();
  if (temp === undefined) return {};
  const m = model.trim().toLowerCase();
  if (m.startsWith("gpt-5") || /^o[0-9]/.test(m) || m.startsWith("o1") || m.startsWith("o3")) {
    return {};
  }
  return { temperature: temp };
}

export function getAgentQualityChatModel(): string {
  return (
    process.env.OPENAI_AGENT_QUALITY_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.orchestratorAgentsMetaMemoryJournal
  );
}

export function getAgentQualityChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_AGENT_QUALITY_FALLBACK_MODEL",
    OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning,
  );
}

export function getAgentSocialMiniChatModel(): string {
  return process.env.OPENAI_AGENT_SOCIAL_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.calendarSocialOnly;
}

export function getAgentSocialMiniChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_AGENT_SOCIAL_FALLBACK_MODEL",
    OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.socialMini,
  );
}

/** Async security reviewer — defaults to social mini (cheap JSON). */
export function getSecurityAgentChatModel(): string {
  return process.env.OPENAI_SECURITY_AGENT_MODEL?.trim() || getAgentSocialMiniChatModel();
}

export function getSecurityAgentChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_SECURITY_AGENT_FALLBACK_MODEL",
    getAgentSocialMiniChatFallbackModel() ?? OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.socialMini,
  );
}

export function getMetaChatModel(): string {
  return process.env.OPENAI_META_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.orchestratorAgentsMetaMemoryJournal;
}

export function getMetaChatFallbackModel(): string | null {
  return envFallbackOrDefault("OPENAI_META_FALLBACK_MODEL", OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning);
}

export function getMemoryExtractionChatModel(): string {
  return process.env.MEMORY_EXTRACTION_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.orchestratorAgentsMetaMemoryJournal;
}

export function getMemoryExtractionChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "MEMORY_EXTRACTION_FALLBACK_MODEL",
    OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning,
  );
}

/** 会話からの日記草案は頻度が高いため、既定は mini（振り返りチャット本体のモデルより軽くする） */
export function getJournalComposerChatModel(): string {
  return (
    process.env.OPENAI_JOURNAL_COMPOSER_MODEL?.trim() ||
    OPENAI_CHAT_MODEL_SNAPSHOT.calendarSocialOnly
  );
}

export function getJournalComposerChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_JOURNAL_COMPOSER_FALLBACK_MODEL",
    OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning,
  );
}

/** プルチック感情分析。既定は日記草案と同系の軽量モデル。 */
export function getPlutchikEmotionChatModel(): string {
  return (
    process.env.OPENAI_PLUTCHIK_EMOTION_MODEL?.trim() ||
    process.env.OPENAI_JOURNAL_COMPOSER_MODEL?.trim() ||
    OPENAI_CHAT_MODEL_SNAPSHOT.calendarSocialOnly
  );
}

export function getPlutchikEmotionChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_PLUTCHIK_EMOTION_FALLBACK_MODEL",
    getJournalComposerChatFallbackModel() ?? OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning,
  );
}

export function getSupervisorChatModel(): string {
  return process.env.OPENAI_SUPERVISOR_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.orchestratorAgentsMetaMemoryJournal;
}

export function getSupervisorChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_SUPERVISOR_FALLBACK_MODEL",
    OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.reasoning,
  );
}

/**
 * 振り返りチャットの「深掘りモード」二値分類。既定はソーシャル mini（軽量）。
 * `OPENAI_TOPIC_DEEPENING_CLASSIFIER_MODEL=none` で無効化。
 */
export function getTopicDeepeningClassifierChatModel(): string | null {
  const raw = process.env.OPENAI_TOPIC_DEEPENING_CLASSIFIER_MODEL;
  if (raw !== undefined && (/^none$/i.test(raw.trim()) || raw.trim() === "")) {
    return null;
  }
  const m = raw?.trim();
  return m || getAgentSocialMiniChatModel();
}

export function getTopicDeepeningClassifierChatFallbackModel(): string | null {
  return envFallbackOrDefault(
    "OPENAI_TOPIC_DEEPENING_CLASSIFIER_FALLBACK_MODEL",
    getAgentSocialMiniChatFallbackModel() ?? OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.socialMini,
  );
}

export function getCalendarClassifyOpenAiModel(): string {
  return process.env.OPENAI_AUTO_CLASSIFY_MODEL?.trim() || OPENAI_CHAT_MODEL_SNAPSHOT.calendarAutoClassifyOpenAi;
}

export function getCalendarClassifyOpenAiFallbackModel(): string {
  const raw = process.env.OPENAI_AUTO_CLASSIFY_FALLBACK_MODEL;
  if (raw !== undefined) {
    const t = raw.trim();
    if (t === "" || /^none$/i.test(t)) return getCalendarClassifyOpenAiModel();
    return t;
  }
  return OPENAI_CHAT_MODEL_FALLBACK_DEFAULT.calendarClassify;
}

/**
 * Some Chat Completions models reject `max_tokens` and require `max_completion_tokens`.
 */
export function chatCompletionOutputTokenLimit(
  model: string,
  maxOutputTokens: number,
): { max_tokens: number } | { max_completion_tokens: number } {
  const m = model.trim().toLowerCase();
  const needsCompletionCap =
    m.startsWith("gpt-5") || /^o[0-9]/.test(m) || m.startsWith("o1");
  if (needsCompletionCap) {
    return { max_completion_tokens: maxOutputTokens };
  }
  return { max_tokens: maxOutputTokens };
}
