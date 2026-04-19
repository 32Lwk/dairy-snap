/**
 * Rule-based thresholds for reflective chat (aligned with AgentPersonaPreferences).
 * After min user turns, the model may suggest diary draft — still subject to its judgment.
 */

export type PersonaDiaryNudgeKeys = {
  aiDepthLevel?: string;
  aiChatTone?: string;
};

/** Count of user messages in the thread including the current send. */
export function countUserTurnsIncludingCurrent(
  historyMessages: { role: "user" | "assistant" }[],
): number {
  const prior = historyMessages.filter((m) => m.role === "user").length;
  return prior + 1;
}

/**
 * Minimum user messages before the orchestrator may suggest trying the AI diary draft.
 * Derived from 掘り下げの深さ + 話し方（トーン）.
 */
export function getDiaryProposalMinUserTurns(profile: PersonaDiaryNudgeKeys): number {
  const depth = profile.aiDepthLevel?.trim() || "";
  const tone = profile.aiChatTone?.trim() || "";

  let base = 4;
  if (depth === "light") base = 2;
  else if (depth === "normal") base = 3;
  else if (depth === "deep") base = 7;
  else if (depth === "") base = 4;

  let delta = 0;
  if (tone === "brief") delta -= 1;
  else if (tone === "encouraging") delta -= 1;
  else if (tone === "factual") delta += 1;
  else if (tone === "questions") delta += 2;
  else if (tone === "empathic") delta += 0;

  return Math.min(12, Math.max(2, base + delta));
}

export type EventSceneFollowupIntensity = "minimal" | "standard" | "rich";

export function getEventSceneFollowupIntensity(profile: PersonaDiaryNudgeKeys): EventSceneFollowupIntensity {
  const depth = profile.aiDepthLevel?.trim() || "";
  const tone = profile.aiChatTone?.trim() || "";

  if (depth === "light" || tone === "brief") return "minimal";
  if (depth === "deep" || tone === "questions") return "rich";
  return "standard";
}

/** English system block: diary draft CTA gate + optional suggestion rules */
export function formatOrchestratorDiaryProposalGateBlock(args: {
  userTurnsIncludingThis: number;
  minUserTurnsBeforeDiaryProposal: number;
}): string {
  const { userTurnsIncludingThis, minUserTurnsBeforeDiaryProposal } = args;
  return [
    "## Diary draft suggestion (rule gate + your judgment)",
    `Counted user turns in this thread **including this message**: ${userTurnsIncludingThis}.`,
    `Persona rule: you may suggest trying the in-app AI diary draft (the area below chat, e.g. generating a draft from the conversation) **only** when that count is >= ${minUserTurnsBeforeDiaryProposal}.`,
    userTurnsIncludingThis < minUserTurnsBeforeDiaryProposal
      ? `Current count is **below** the threshold — do **not** suggest opening / generating the diary draft this turn.`
      : `Current count meets the threshold — you **may** suggest it **only if** the exchange already feels like a natural pause or there is enough material for a reasonable first pass; if the user is mid-story, upset without closure, or just opened a big new topic, **skip** the suggestion this turn.`,
    "When you do suggest, one short natural Japanese sentence is enough (no Markdown, no UI path like \"DOM\"). Do not command; invite lightly.",
  ].join("\n");
}

/** English system block: deepen social / calendar / outing scenes per persona */
export function formatOrchestratorEventSceneFollowupBlock(intensity: EventSceneFollowupIntensity): string {
  const common =
    "When the user mentions a concrete outing, shift, meet-up, class, party, work block, or calendar-like slice of the entry day, enrich the recap (without inventing facts). Respect 「避けたい話題」 and health comfort; do not push medical detail.";

  if (intensity === "minimal") {
    return [
      "## Event / scene follow-ups (persona: lighter)",
      common,
      "At most one light dimension per turn (e.g. rough duration **or** who was there **or** overall mood). One question total.",
    ].join("\n");
  }
  if (intensity === "rich") {
    return [
      "## Event / scene follow-ups (persona: deeper)",
      common,
      "Prefer weaving **who** (roles or how many; avoid forcing real names if user avoids them), **approximate duration or time window**, and **how it felt** — still as **one** compact question or one question plus a non-question empathic clause (stay within 2–4 short sentences overall).",
      "If they already gave rich detail, switch to another same-day angle instead of repeating who/duration/feeling.",
    ].join("\n");
  }
  return [
    "## Event / scene follow-ups (persona: standard)",
    common,
    "Often pick one of: who was involved (role-level if names unclear), about how long / what time window, or emotional tone — rotate across turns. One question total unless persona explicitly prefers very short replies.",
  ].join("\n");
}

/** スレッド履歴（いま送る直前まで）の直近アシスタント本文 */
export function lastAssistantFromHistory(history: { role: string; content: string }[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "assistant") return history[i]!.content;
  }
  return null;
}

/** 直前の AI 返信が「日記・草案・まとめ」系のフォローか（短い承諾のあとに草案 UI を開く判定用） */
export function assistantHintsJournalDraftFollowup(assistantText: string): boolean {
  return /(日記|草案|下書き|会話から|AI\s*日記|本文へ反映|ひとまとめ|まとめてみ|してみて|してみない|プレビュー|右欄|下の)/u.test(
    assistantText,
  );
}

export type JournalDraftMaterialTier = "rich" | "thin" | "empty";

/** 日記草案に使える「中身のある」ユーザー発言か（短文の相槌は除外） */
export function isSubstantiveUserJournalLine(raw: string): boolean {
  const s = raw.replace(/\u3000/g, " ").trim();
  if (!s) return false;
  if (s.length < 10) return false;
  if (userMessageIsShortDiaryAffirmation(s)) return false;
  if (/^(はい|ええ|うん|ありがとう|ありがとうございます|了解|承知|承知しました|OK|オッケー|なるほど|そうですね)([。!！…\s]+)?$/iu.test(s)) {
    return false;
  }
  return true;
}

export type JournalDraftMaterial = {
  tier: JournalDraftMaterialTier;
  reasonJa: string;
  userTurns: number;
  userSubstantiveTurns: number;
  minTurnsForRich: number;
  substantiveUserCharSum: number;
};

/** 会話ログから「会話だけで日記草案を書けるか」の目安（オーケストレーターと草案 API で共通） */
export function classifyJournalDraftMaterial(
  messages: { role: string; content: string }[],
  profile: PersonaDiaryNudgeKeys,
): JournalDraftMaterial {
  const minTurnsForRich = getDiaryProposalMinUserTurns(profile);
  const userLines = messages.filter((m) => m.role === "user").map((m) => m.content);
  const userTurns = userLines.length;
  const substantiveContents = userLines.filter(isSubstantiveUserJournalLine);
  const userSubstantiveTurns = substantiveContents.length;
  const substantiveUserCharSum = substantiveContents.reduce(
    (a, line) => a + line.replace(/\u3000/g, " ").trim().length,
    0,
  );

  if (userSubstantiveTurns === 0) {
    return {
      tier: "empty",
      reasonJa:
        "日記に使えるほどのユーザーの発言がまだありません（AI の開口や短文の返事だけの状態です）。このまま生成すると、会話にない出来事が混ざりやすいです。",
      userTurns,
      userSubstantiveTurns: 0,
      minTurnsForRich,
      substantiveUserCharSum: 0,
    };
  }

  const richByTurns = userSubstantiveTurns >= minTurnsForRich;
  /** ターン数だけ足りても中身が薄い場合は thin */
  const richByChars = substantiveUserCharSum >= 96;
  const tier: JournalDraftMaterialTier = richByTurns && richByChars ? "rich" : "thin";

  const reasonJa =
    tier === "rich"
      ? "会話の材料は十分そうです。このまま草案を生成できます。"
      : `まだ具体的な発言が少ない状態です（目安: 中身のある発言がおおよそ ${minTurnsForRich} 回以上・ある程度の文量）。このままだと、会話にない内容が混ざりやすい不完全な草案になりがちです。`;

  return {
    tier,
    reasonJa,
    userTurns,
    userSubstantiveTurns,
    minTurnsForRich,
    substantiveUserCharSum,
  };
}

/** 「はい／作成して／お願い」など短い承諾・依頼だけか */
export function userMessageIsShortDiaryAffirmation(raw: string): boolean {
  const s = raw.trim().replace(/\u3000/g, " ");
  if (!s || s.length > 56) return false;
  return /^(はい|ええ|うん|OK|オッケー|お願い(します)?|ありがとう|それで|作成して(ください)?|生成して(ください)?|出して(ください)?|まとめて(ください)?|やって|再度作成して(ください)?)[。!！…\s]*$/iu.test(
    s,
  );
}

/** 明示的に「会話から草案」等を頼んだか（短文の「作成して」単体は含めない） */
export function userMessageExplicitlyRequestsJournalDraft(raw: string): boolean {
  const s = raw.trim().replace(/\u3000/g, " ");
  if (!s) return false;

  const patterns: RegExp[] = [
    /会話(から)?.{0,16}草案/u,
    /チャット(から)?.{0,16}草案/u,
    /草案.{0,14}(を)?(生成|作成|書いて|出して|ください|お願い)/u,
    /下書き.{0,12}(を)?(生成|作成|書いて|ください|お願い)/u,
    /日記.{0,20}(草案|まとめて|生成|作成|書いて|ください|お願い)/u,
    /AI\s*日記.{0,16}(生成|作成|草案|ください|お願い)/u,
    /(まとめて|生成して|作成して).{0,12}(日記|草案|下書き)/u,
  ];
  return patterns.some((re) => re.test(s));
}

/**
 * チャット送信後に右欄「会話から草案を生成」と同じプレビューを自動で走らせるか。
 * 素材が rich のときのみ自動。明示依頼でも素材 empty では走らせない。
 */
export function shouldTriggerJournalDraftPanelAfterSend(
  userMessage: string,
  lastAssistant: string | null,
  material: JournalDraftMaterial,
): boolean {
  if (material.tier === "empty") return false;
  if (userMessageExplicitlyRequestsJournalDraft(userMessage)) return material.tier === "rich";
  if (userMessageIsShortDiaryAffirmation(userMessage) && lastAssistant && assistantHintsJournalDraftFollowup(lastAssistant)) {
    return material.tier === "rich";
  }
  return false;
}

/**
 * 文脈なしの短い一言だけのターンはツール無しの mini で応答（コスト・レイテンシ削減）。
 * 草案プレビューを開くターンでは false（通常オーケストレータ）。
 */
export function shouldUseMiniOrchestratorForReflectiveChat(
  userMessage: string,
  lastAssistant: string | null,
  material: JournalDraftMaterial,
): boolean {
  if (shouldTriggerJournalDraftPanelAfterSend(userMessage, lastAssistant, material)) return false;
  const s = userMessage.trim().replace(/\u3000/g, " ");
  if (!s || s.length > 40) return false;
  const bareShort =
    /^(作成|生成)して(ください)?[。!！\s]*$/u.test(s) ||
    /^(はい|ええ|うん|お願いします?)[。!！\s]*$/u.test(s) ||
    /^OK[。!！\s]*$/iu.test(s);
  if (!bareShort) return false;
  if (lastAssistant && assistantHintsJournalDraftFollowup(lastAssistant)) return false;
  return true;
}
