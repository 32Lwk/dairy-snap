/**
 * MAS orchestrator — tool-calling agents, streaming reply.
 */
import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources";
import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentSocialMiniChatFallbackModel,
  getAgentSocialMiniChatModel,
  getOrchestratorChatFallbackModel,
  getOrchestratorChatModel,
  getOrchestratorOpeningChatFallbackModel,
  getOrchestratorOpeningChatModel,
  orchestratorOpeningSamplingParams,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallbackAndModel } from "@/lib/ai/openai-model-fallback";
import {
  diffCalendarDaysInZone,
  formatYmdInTimeZone,
  getEffectiveTodayYmd,
  resolveDayBoundaryEndTime,
  resolveUserTimeZone,
} from "@/lib/time/user-day-boundary";
import {
  calendarOpeningCategoryOptions,
  formatOrchestratorStaticProfileBlock,
  parseUserSettings,
  type CalendarOpeningCategory,
  type CalendarOpeningSettings,
} from "@/lib/user-settings";
import { formatAgentPersonaForPrompt } from "@/lib/agent-persona-preferences";
import { isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import { isLoveMbtiType, loveMbtiDisplayJa } from "@/lib/love-mbti";
import { prisma } from "@/server/db";
import {
  fetchCalendarEventsForDay,
  type CalendarEventBrief,
  type CalendarFetchResult,
} from "@/server/calendar";
import { formatTimetableNextFocusForOpeningJa, formatYmdWithTokyoWeekday } from "@/lib/timetable";
import {
  buildReflectiveOpeningSystemInstruction,
  formatOrchestratorDayBoundaryBlock,
  formatOrchestratorConversationScopeBlock,
  formatOrchestratorScheduleGroundingBlock,
  formatOrchestratorSparseThreadHintBlock,
  formatOrchestratorTemporalBlock,
  formatOrchestratorWallClockDaylightBlock,
  ORCHESTRATOR_DAY_CALENDAR_HEADING,
} from "@/lib/time/entry-temporal-context";
import { hasInterestProfileSignals, isSparseSchedule } from "@/lib/opening-sparse-schedule";
import {
  formatJpAnniversaryLocalSystemBlock,
  getJpAnniversaryNamesForYmd,
} from "@/lib/jp-anniversary-local";
import { triviaLineForJapaneseHoliday } from "@/lib/jp-holiday-trivia";
import { paraphraseHolidayTriviaForOpening } from "@/lib/jp-holiday-trivia-paraphrase";
import { inferCalendarEventCategory } from "@/lib/calendar-opening-infer-event";
import {
  countSubstantiveCalendarPlanEvents,
  filterCalendarEventsForAiNationalHolidaySanity,
  isDecorativeNationalHolidayLikeCalendarEvent,
  resolveJapaneseHolidayNameForEntry,
} from "@/lib/jp-holiday";
import { AppLogScope, newCorrelationId, scheduleAppLog } from "@/lib/server/app-log";
import { DEFAULT_WEATHER_LATITUDE, DEFAULT_WEATHER_LONGITUDE } from "@/lib/location-defaults";
import {
  formatOrchestratorDiaryProposalGateBlock,
  formatOrchestratorEventSceneFollowupBlock,
  formatOrchestratorTopicDeepeningBlock,
  getDiaryProposalMinUserTurns,
  getEventSceneFollowupIntensity,
  shouldApplyTopicDeepeningMode,
  type JournalDraftMaterialTier,
} from "@/lib/reflective-chat-diary-nudge-rules";
import { loadAgentPrompt } from "@/server/agents/utils";
import { getWeatherContext, formatWeatherForPrompt, formatWeatherToolReply } from "@/server/agents/weather-tool";
import { runSchoolAgent } from "@/server/agents/school-agent";
import { runCalendarDailyAgent } from "@/server/agents/calendar-daily-agent";
import { runCalendarWorkAgent } from "@/server/agents/calendar-work-agent";
import { runCalendarSocialAgent } from "@/server/agents/calendar-social-agent";
import { runHobbyAgent } from "@/server/agents/hobby-agent";
import { runRomanceAgent } from "@/server/agents/romance-agent";
import { runGithubAgent } from "@/server/agents/github-agent";
import { runSupervisorAgent } from "@/server/agents/supervisor-agent";
import type { AgentRequest, PersonaContext, WeatherContext } from "@/server/agents/types";
import { ORCHESTRATOR_TOOLS } from "@/server/agents/types";
import { loadShortTermContextStructuredForEntry } from "@/server/mas-memory";
import { buildLongTermProfileBlockText } from "@/server/long-term-profile-block";
import { loadGithubOrchestratorBlock } from "@/server/github/prompt-context";
import { replaceOrchestratorTodayFactsSection } from "@/lib/orchestrator-today-facts-replace";
import { scoreOpeningTopic } from "@/server/chat-context";
import {
  calendarAgentReplyToToolFactCard,
  calendarDayToToolFactCard,
  clipToolFactCards,
  formatTodayReferentialFactsSection,
  schoolAgentReplyToToolFactCard,
  weatherToToolFactCard,
  type ToolFactCard,
} from "@/lib/tool-fact-card";
import { getOrchestratorAgentPromptBasename, resolvePolicyVersion } from "@/server/prompts";
import { runProposeSettingsChangeTool } from "@/server/agents/settings-agent";
import { classifyTopicDeepeningParallel } from "@/server/topic-deepening-classifier";

const OPENING_OMIT_TOOLS = new Set([
  "query_weather",
  "query_calendar_daily",
  "query_calendar_work",
  "query_calendar_social",
  "query_github",
  "propose_settings_change",
]);

/** Opening chat user line: avoids a lone "." which often elicits meta / "system will…" preambles. */
const OPENING_TURN_USER_MESSAGE = "Begin the opening turn.";
/** Sub-agents during opening: keep a neutral non-empty cue (some models echo "." oddly). */
const OPENING_TOOL_USER_FALLBACK = " ";

const ORCHESTRATOR_TOOL_ROUND_MAX_TOKENS = 2048;
const ORCHESTRATOR_STREAM_MAX_TOKENS = 2048;
/**
 * 開口の最終ストリーム上限。
 * gpt-5 系などは推論に `max_completion_tokens` を割くため、表示が途中で切れないようやや多めに取る。
 * （実際の長さはプロンプトで 2〜6 文程度に抑える）
 */
const ORCHESTRATOR_STREAM_MAX_TOKENS_OPENING = 8192;
const DIARY_BODY_MAX_CHARS_ORCHESTRATOR = 12000;

// --- MBTI routing hints ---

function buildMbtiHint(mbti?: string, loveMbti?: string): string {
  const hints: string[] = [];

  if (mbti && isMbtiType(mbti)) {
    hints.push(`MBTI: ${mbtiDisplayJa(mbti)}`);
    const isE = mbti.startsWith("E");
    const isF = mbti[2] === "F";
    const isJ = mbti[3] === "J";
    const isP = mbti[3] === "P";
    if (isE && isF) hints.push("外向・感情型: 趣味・人間関係・恋愛の話題を積極的に取り上げてよい。");
    else if (!isE && !isF) hints.push("内向・思考型: 事実・論理・目標の話を好む。感情の話は相手から話してくれるのを待つ。");
    else if (isE) hints.push("外向型: 積極的な会話・体験談を歓迎する。");
    else hints.push("内向型: 深い話を好むが、急かさない。");
    if (isJ) hints.push("判断型: 計画・目標・振り返りの構造を好む。");
    if (isP) hints.push("知覚型: 即興・体験・新発見の話を好む。");
  }

  if (loveMbti && isLoveMbtiType(loveMbti)) {
    hints.push(`恋愛タイプ: ${loveMbtiDisplayJa(loveMbti)}`);
  }

  return hints.join(" ") || "";
}

// ─── エージェントメモリ取得 ─────────────────────────────────────────────

async function loadAgentMemory(userId: string, domain: string): Promise<Record<string, string>> {
  const rows = await prisma.agentMemory.findMany({
    where: { userId, domain },
    select: { memoryKey: true, memoryValue: true },
  });
  return Object.fromEntries(rows.map((r) => [r.memoryKey, r.memoryValue]));
}

async function saveAgentMemory(
  userId: string,
  domain: string,
  updates: Record<string, string>,
): Promise<void> {
  for (const [memoryKey, memoryValue] of Object.entries(updates)) {
    await prisma.agentMemory.upsert({
      where: { userId_domain_memoryKey: { userId, domain, memoryKey } },
      create: { userId, domain, memoryKey, memoryValue },
      update: { memoryValue },
    });
  }
}

// --- long-term memory ---

async function loadLongTermContext(userId: string): Promise<string> {
  const memories = await prisma.memoryLongTerm.findMany({
    where: { userId },
    orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: { bullets: true },
  });
  if (memories.length === 0) return "";
  const lines = memories
    .flatMap((m) => (Array.isArray(m.bullets) ? (m.bullets as string[]) : []))
    .slice(0, 10);
  return lines.map((l) => `- ${l}`).join("\n");
}

// ─── 対象日カレンダー要約（システム注入・全会話ターン共通）────────────────────

function hhmmInUserZoneBrief(isoLike: string, timeZone: string): string {
  if (!isoLike || /^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return "";
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/** 開口プロンプト用: 分類ラベルをそのまま見せ、就活系バケットは「確定ではない」と明示する */
function openingCalendarCategoryTagJa(ev: CalendarEventBrief, calendarOpening: CalendarOpeningSettings | undefined): string {
  const cat = inferCalendarEventCategory(ev, calendarOpening ?? null);
  if (cat === "parttime") return "（バイト/シフト）";
  if (cat === "job_hunt") {
    return "（分類: 就活/面接系・業務も含む／面接・説明会・別件はユーザー確認）";
  }
  if ((cat as string).startsWith("usercat:")) {
    const opts = calendarOpeningCategoryOptions(calendarOpening ?? null);
    const lab = opts.find((o) => o.id === (cat as CalendarOpeningCategory))?.label?.trim() ?? "";
    if (!lab) return "";
    const hint = lab.normalize("NFKC");
    if (
      /就活|面接|採用|説明会|企業|インターン|リクルート|選考|キャリア|OB|OG|キックオフ|会社説明|労働|業務/i.test(hint)
    ) {
      return `（分類: ${lab}／具体的内容はユーザー確認）`;
    }
  }
  return "";
}

function formatOneOpeningCalendarLine(
  ev: CalendarEventBrief,
  timeZone: string,
  calendarOpening: CalendarOpeningSettings | undefined,
): string {
  const t = hhmmInUserZoneBrief(ev.start, timeZone);
  const when = t || "終日";
  const loc = ev.location?.trim() ? ` @${ev.location.trim()}` : "";
  const title = ev.title?.trim() || "（タイトルなし）";
  const catTag = openingCalendarCategoryTagJa(ev, calendarOpening);
  return `- ${when} ${title}${loc}${catTag}`;
}

/** `orderedEvIdx`: 開口時は Impact×近さでソートした event インデックス（先頭ほど優先） */
function formatOpeningDayCalendarBrief(
  events: CalendarEventBrief[],
  orderedEvIdx: number[] | undefined,
  timeZone: string,
  calendarOpening: CalendarOpeningSettings | undefined,
): string {
  if (events.length === 0) {
    return "（この日の予定は登録されていないか、取得結果が空です）";
  }
  const used = new Set<number>();
  const lines: string[] = [];
  const max = 28;
  if (orderedEvIdx?.length) {
    for (const i of orderedEvIdx) {
      if (i < 0 || i >= events.length || used.has(i)) continue;
      used.add(i);
      lines.push(formatOneOpeningCalendarLine(events[i]!, timeZone, calendarOpening));
      if (lines.length >= max) break;
    }
  }
  for (let i = 0; i < events.length && lines.length < max; i++) {
    if (used.has(i)) continue;
    lines.push(formatOneOpeningCalendarLine(events[i]!, timeZone, calendarOpening));
  }
  return lines.join("\n");
}

type HolidaySignal = {
  /** True when calendar contains an all-day holiday/off signal. */
  hasHolidayLikeAllDay: boolean;
  /** Human-readable short list of all-day holiday/off event titles. */
  titles: string[];
};

function isAllDayIsoLike(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((s ?? "").trim());
}

function looksLikeHolidayCalendarIdOrName(ev: CalendarEventBrief): boolean {
  const id = (ev.calendarId ?? "").toLowerCase();
  const name = (ev.calendarName ?? "").toLowerCase();
  if (id.includes("#holiday@")) return true;
  if (id.includes("holiday") && id.includes("@group.v.calendar.google.com")) return true;
  if (name.includes("祝日") || name.includes("holiday")) return true;
  if (name.includes("日本の祝日") || name.includes("祝日カレンダー")) return true;
  return false;
}

function looksLikeHolidayTitle(titleRaw: string): boolean {
  const t = (titleRaw ?? "").trim();
  if (!t) return false;
  // Keep conservative: aim for "obvious" holiday/off signals only.
  if (t.includes("祝日")) return true;
  if (t.includes("休日")) return true;
  if (t.includes("振替休日")) return true;
  if (t.includes("代休")) return true;
  // "休み" is ambiguous; treat as holiday-like only when it is explicit enough.
  if (t === "休み" || t === "お休み") return true;
  if (/^(休み|お休み)(（|$)/.test(t)) return true;
  return false;
}

function detectHolidaySignal(events: CalendarEventBrief[]): HolidaySignal {
  const titles: string[] = [];
  for (const ev of events) {
    if (!isAllDayIsoLike(ev.start)) continue;
    const title = (ev.title ?? "").trim();
    if (!title) continue;
    if (looksLikeHolidayCalendarIdOrName(ev) || looksLikeHolidayTitle(title)) {
      titles.push(title);
    }
  }
  const uniq = [...new Set(titles)].slice(0, 6);
  return { hasHolidayLikeAllDay: uniq.length > 0, titles: uniq };
}

/** カレンダー連携が有効か（未連携・設定不備・invalid_grant ではツールを登録しない） */
function isCalendarToolEligible(res: CalendarFetchResult): boolean {
  if (res.ok) return true;
  return !(
    res.reason === "no_google_account" ||
    res.reason === "no_refresh_token" ||
    res.reason === "oauth_not_configured" ||
    res.reason === "invalid_grant"
  );
}

// ─── scoreOpeningTopic プリフィルター ────────────────────────────────────

type OpeningHint = {
  recommendedAgents: string[];
  openingNote: string;
};

type BuildOpeningHintOpts = {
  /** 国民祝日かつ実質タイムド予定なし: 開口で労働系カレンダーを推奨しない（バイト前提のフレーミングを弱める） */
  omitCalendarWorkForNationalHolidayNoPlans?: boolean;
  /** 薄い日または祝日ラベル付きで、関心タグがあるとき `query_hobby` を推奨（E/F 以外でも） */
  suggestHobbyForRichProfileLightDay?: boolean;
};

function buildOpeningHint(
  occupationRole: string | undefined,
  hasCalendar: boolean,
  weather: WeatherContext,
  persona: PersonaContext,
  opts?: BuildOpeningHintOpts,
): OpeningHint {
  const agents: string[] = [];
  const notes: string[] = [];

  if (weather.source !== "none") {
    notes.push(weather.narrativeHint ?? "");
  }

  if (hasCalendar) {
    agents.push("query_calendar_daily");
  }

  if (occupationRole === "student") {
    agents.push("query_school");
  } else if (occupationRole && !opts?.omitCalendarWorkForNationalHolidayNoPlans) {
    agents.push("query_calendar_work");
  }

  const mbti = persona.mbti ?? "";
  const isEF = mbti.startsWith("E") && mbti[2] === "F";
  if (isEF || opts?.suggestHobbyForRichProfileLightDay) {
    agents.push("query_hobby");
  }

  if (!persona.avoidTopics.includes("romance") && persona.loveMbti) {
    // 恋愛エージェントは開口よりもユーザーが話題を出してから呼ぶ
  }

  return {
    recommendedAgents: [...new Set(agents)],
    openingNote: notes.filter(Boolean).join(" "),
  };
}

// ─── ツール実行 ──────────────────────────────────────────────────────────

type AgentCallArgs = {
  req: AgentRequest;
  domain: string;
  userId: string;
  runFn: (r: AgentRequest) => Promise<{ answer: string; hasRelevantInfo: boolean; updatedMemory?: Record<string, string> }>;
};

async function callAgent({ req, domain, userId, runFn }: AgentCallArgs): Promise<{
  text: string;
  factCards: ToolFactCard[];
}> {
  try {
    const result = await runFn(req);
    if (result.updatedMemory && Object.keys(result.updatedMemory).length > 0) {
      await saveAgentMemory(userId, domain, result.updatedMemory).catch(() => {});
    }
    const text = result.answer || "（該当情報なし）";
    const factCards: ToolFactCard[] = [];
    if (domain === "school") {
      factCards.push(schoolAgentReplyToToolFactCard(req.entryDateYmd, result.answer, result.hasRelevantInfo));
    } else if (domain === "calendar_daily") {
      factCards.push(
        calendarAgentReplyToToolFactCard("daily", req.entryDateYmd, result.answer, result.hasRelevantInfo),
      );
    } else if (domain === "calendar_work") {
      factCards.push(
        calendarAgentReplyToToolFactCard("work", req.entryDateYmd, result.answer, result.hasRelevantInfo),
      );
    } else if (domain === "calendar_social") {
      factCards.push(
        calendarAgentReplyToToolFactCard("social", req.entryDateYmd, result.answer, result.hasRelevantInfo),
      );
    }
    return { text, factCards };
  } catch (e) {
    const errHint = String(e).slice(0, 120);
    const factCards: ToolFactCard[] = [];
    if (domain === "school") {
      factCards.push(schoolAgentReplyToToolFactCard(req.entryDateYmd, "", false, errHint));
    } else if (domain === "calendar_daily") {
      factCards.push(calendarAgentReplyToToolFactCard("daily", req.entryDateYmd, "", false, errHint));
    } else if (domain === "calendar_work") {
      factCards.push(calendarAgentReplyToToolFactCard("work", req.entryDateYmd, "", false, errHint));
    } else if (domain === "calendar_social") {
      factCards.push(calendarAgentReplyToToolFactCard("social", req.entryDateYmd, "", false, errHint));
    }
    return {
      text: `（エージェントエラー: ${String(e).slice(0, 80)}）`,
      factCards,
    };
  }
}

// --- runOrchestrator ---

export type OrchestratorParams = {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  userMessage: string;
  historyMessages: { role: "user" | "assistant"; content: string }[];
  isOpening: boolean;
  encryptionMode: string;
  currentBody: string;
  /** Normal chat only: user message count including this send (for diary-draft suggestion gate). */
  reflectiveUserTurnIncludingCurrent?: number;
  /** Reflective chat: journal material tier from the same classifier as the chat route (deepening mode). */
  reflectiveJournalMaterialTier?: JournalDraftMaterialTier;
  /** 短文だけのターン: mini モデル＋ツールなしで軽量応答 */
  preferMiniOrchestrator?: boolean;
  /** クライアント送信時刻を反映した壁時計（未指定時は呼び出し側で `new Date()` を渡す） */
  clockNow?: Date;
  /** チャットスレッド（設定提案の pending 保存に使用） */
  threadId?: string | null;
  /** 直前の設定適用など、system に追記するブロック（Markdown 可） */
  extraSystemAppend?: string;
  /**
   * 開口のみ: カレンダー日とエントリ日がずれている等のとき `propose_settings_change` をツール候補に含める
   * （通常の開口では OPENING_OMIT_TOOLS で除外される）
   */
  openingAllowSettingsTool?: boolean;
};

export type OrchestratorResult = {
  stream: Stream<ChatCompletionChunk>;
  agentsUsed: string[];
  personaInstructions: string;
  mbtiHint: string;
  /** Chat Completions に渡した実モデル ID（フォールバック時はここに反映） */
  orchestratorModel: string;
  threadId?: string;
  /** stdout 構造化ログの突合用（`APP_LOG_LEVEL=debug` など） */
  correlationId: string;
  policyVersion: string;
  /** 今日の参照事実として注入した正規化カード（スナップショット・ログ用） */
  toolFactCards: ToolFactCard[];
};

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown;
};

export async function runOrchestrator(params: OrchestratorParams): Promise<OrchestratorResult> {
  const {
    userId,
    entryId,
    entryDateYmd,
    userMessage,
    historyMessages,
    isOpening,
    currentBody,
    reflectiveUserTurnIncludingCurrent,
    reflectiveJournalMaterialTier,
    preferMiniOrchestrator,
    clockNow,
    threadId,
    extraSystemAppend,
    openingAllowSettingsTool,
  } = params;

  const correlationId = newCorrelationId();
  const orchestratorNow = clockNow ?? new Date();

  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true, timeZone: true },
  });
  const parsedSettings = parseUserSettings(userRow?.settings ?? {});
  const profile = parsedSettings.profile;
  const dayBoundaryEndTime = parsedSettings.dayBoundaryEndTime ?? null;
  const userTimeZone = resolveUserTimeZone(profile?.timeZone, userRow?.timeZone);
  const boundaryResolved = resolveDayBoundaryEndTime(dayBoundaryEndTime);
  const todayYmd = getEffectiveTodayYmd(orchestratorNow, userTimeZone, boundaryResolved);
  const temporalOpts = { timeZone: userTimeZone, dayBoundaryEndTime };

  const diaryProposalMinUserTurns = getDiaryProposalMinUserTurns({
    aiDepthLevel: profile?.aiDepthLevel,
    aiChatTone: profile?.aiChatTone,
  });
  const ruleTopicDeepening =
    !isOpening &&
    typeof reflectiveUserTurnIncludingCurrent === "number" &&
    shouldApplyTopicDeepeningMode(
      userMessage,
      reflectiveUserTurnIncludingCurrent,
      diaryProposalMinUserTurns,
      reflectiveJournalMaterialTier ?? "empty",
    );

  const preferMiniInitial = Boolean(preferMiniOrchestrator) && !isOpening;
  let useMini = preferMiniInitial;
  let primaryModel = isOpening ? getOrchestratorOpeningChatModel() : getOrchestratorChatModel();
  let fallbackModel = isOpening ? getOrchestratorOpeningChatFallbackModel() : getOrchestratorChatFallbackModel();
  if (useMini) {
    primaryModel = getAgentSocialMiniChatModel();
    fallbackModel = getAgentSocialMiniChatFallbackModel();
  }

  const classifierSkip =
    isOpening ||
    ruleTopicDeepening ||
    !userMessage.trim() ||
    typeof reflectiveUserTurnIncludingCurrent !== "number";

  const [longTermLegacy, shortTermContext, weather, calendarRes, topicDeepeningFromModel, githubBlockLoaded] =
    await Promise.all([
      loadLongTermContext(userId),
      loadShortTermContextStructuredForEntry(userId, entryId),
      getWeatherContext({ userId, entryId, entryDateYmd, now: orchestratorNow }).catch(
        (): WeatherContext => ({
          dateYmd: entryDateYmd,
          amLabel: "不明",
          amTempC: null,
          pmLabel: "不明",
          pmTempC: null,
          source: "none",
          narrativeHint: "天気情報を取得できなかった。",
          wallClockDaylightBlockEn: formatOrchestratorWallClockDaylightBlock({
            entryDateYmd,
            now: orchestratorNow,
            lat: DEFAULT_WEATHER_LATITUDE,
            lon: DEFAULT_WEATHER_LONGITUDE,
            timeZone: userTimeZone,
            dayBoundaryEndTime,
            beforeSunriseLectureHook: true,
          }),
          promptLat: DEFAULT_WEATHER_LATITUDE,
          promptLon: DEFAULT_WEATHER_LONGITUDE,
        }),
      ),
      fetchCalendarEventsForDay(userId, entryDateYmd),
      classifyTopicDeepeningParallel({
        skip: classifierSkip,
        userMessage,
        historyMessages,
        reflectiveUserTurnIncludingCurrent: reflectiveUserTurnIncludingCurrent ?? 0,
        diaryProposalMinUserTurns,
        materialTier: reflectiveJournalMaterialTier ?? "empty",
        correlationId,
      }),
      loadGithubOrchestratorBlock(userId, entryDateYmd).catch((): string | null => null),
    ]);

  const longTermContext = await buildLongTermProfileBlockText(
    userId,
    isOpening ? "" : userMessage,
    entryDateYmd,
    longTermLegacy,
  );

  const topicDeepening = ruleTopicDeepening || topicDeepeningFromModel;
  if (topicDeepening && preferMiniInitial && !isOpening) {
    useMini = false;
    primaryModel = getOrchestratorChatModel();
    fallbackModel = getOrchestratorChatFallbackModel();
  }
  const githubPromptBlock = useMini ? null : githubBlockLoaded;
  const githubToolEligible = Boolean(!useMini && githubBlockLoaded);
  const calendarAvailable = isCalendarToolEligible(calendarRes);
  const calendarEventsForOrchestrator = calendarRes.ok
    ? filterCalendarEventsForAiNationalHolidaySanity(entryDateYmd, calendarRes.events)
    : [];
  const holidaySignal =
    calendarEventsForOrchestrator.length > 0 ? detectHolidaySignal(calendarEventsForOrchestrator) : null;
  const calendarHolidayTitle =
    holidaySignal?.hasHolidayLikeAllDay ? (holidaySignal.titles[0] ?? null) : null;
  const jpHolidayNameJa = resolveJapaneseHolidayNameForEntry(entryDateYmd, calendarHolidayTitle);
  /** 祝日カレンダー終日など「実質予定なし」に近い行は除外（薄い日・祝日雑学条件の整合） */
  const calendarPlanEventCount = countSubstantiveCalendarPlanEvents(
    calendarEventsForOrchestrator,
    jpHolidayNameJa,
  );
  const calendarEventsSubstantive = calendarEventsForOrchestrator.filter(
    (ev) => !isDecorativeNationalHolidayLikeCalendarEvent(ev, jpHolidayNameJa),
  );

  const personaLines = formatAgentPersonaForPrompt({
    aiAddressStyle: profile?.aiAddressStyle,
    aiChatTone: profile?.aiChatTone,
    aiDepthLevel: profile?.aiDepthLevel,
    aiEnergyPeak: profile?.aiEnergyPeak,
    aiBusyWindows: profile?.aiBusyWindows,
    aiAvoidTopics: profile?.aiAvoidTopics,
    aiCurrentFocus: profile?.aiCurrentFocus,
    aiHealthComfort: profile?.aiHealthComfort,
    aiHousehold: profile?.aiHousehold,
    aiMemoryRecallStyle: profile?.aiMemoryRecallStyle,
    aiMemoryNamePolicy: profile?.aiMemoryNamePolicy,
    aiMemoryForgetBias: profile?.aiMemoryForgetBias,
  });
  const personaInstructions = personaLines.join("\n");
  const staticProfileBlock = formatOrchestratorStaticProfileBlock(profile, entryDateYmd);
  const avoidTopics = profile?.aiAvoidTopics ?? [];
  const mbti = profile?.mbti;
  const loveMbti = profile?.loveMbti;
  const mbtiHint = buildMbtiHint(mbti, loveMbti);
  const corrections = profile?.aiCorrections ?? [];

  const eventFollowupIntensity = getEventSceneFollowupIntensity({
    aiDepthLevel: profile?.aiDepthLevel,
    aiChatTone: profile?.aiChatTone,
  });

  const persona: PersonaContext = {
    instructions: personaInstructions,
    avoidTopics,
    mbti,
    loveMbti,
    mbtiHint: mbtiHint || undefined,
    corrections: corrections.length > 0 ? corrections : undefined,
  };

  const weatherText = formatWeatherForPrompt(weather);

  let calendarOrderedEvIdx: number[] | undefined;
  let openingCalendarPriorityJa = "";
  if (isOpening && calendarRes.ok && calendarEventsSubstantive.length > 0) {
    const sco = scoreOpeningTopic({
      dayEvents: calendarEventsSubstantive,
      occupationRole: profile?.occupationRole ?? "",
      calendarOpening: profile?.calendarOpening,
      profileSignals: profile
        ? {
            interestPicks: profile.interestPicks,
            aiAvoidTopics: profile.aiAvoidTopics,
            aiCurrentFocus: profile.aiCurrentFocus,
          }
        : null,
      wallNow: orchestratorNow,
    });
    calendarOrderedEvIdx = sco.orderedEvIdx.length > 0 ? sco.orderedEvIdx : undefined;
    if (sco.primary) {
      openingCalendarPriorityJa = [
        "### 開口優先（カテゴリ系インパクト × 壁時計からの近さ）",
        `- 第一候補: 「${sco.primary.title}」${sco.primary.time ? ` ${sco.primary.time}` : ""}（時系列: ${sco.primary.timing}）`,
        sco.secondary
          ? `- 第二候補: 「${sco.secondary.title}」${sco.secondary.time ? ` ${sco.secondary.time}` : ""}（時系列: ${sco.secondary.timing}）`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    scheduleAppLog(AppLogScope.opening, "debug", "opening_topic_scores", {
      userId,
      entryId,
      threadId: threadId ?? null,
      entryDateYmd,
      calendarEventCount: calendarEventsSubstantive.length,
      calendarDecorativeStripped:
        calendarEventsForOrchestrator.length - calendarEventsSubstantive.length,
      jpHolidayNameJa,
      calendarHolidaySignalTitle: calendarHolidayTitle,
      entryIsEffectiveToday: diffCalendarDaysInZone(entryDateYmd, todayYmd, userTimeZone) === 0,
      studentTimetableConfigured:
        profile?.occupationRole === "student" && Boolean(profile.studentTimetable?.trim()),
      occupationRole: profile?.occupationRole ?? null,
      openingConfidence: sco.confidence,
      primary: sco.primary
        ? {
            title: sco.primary.title,
            category: sco.primary.category,
            timing: sco.primary.timing,
            time: sco.primary.time,
          }
        : null,
      secondary: sco.secondary
        ? {
            title: sco.secondary.title,
            category: sco.secondary.category,
            timing: sco.secondary.timing,
            time: sco.secondary.time,
          }
        : null,
      orderedEvIdxHead: sco.orderedEvIdx.slice(0, 12),
      eventCategoriesSample: calendarEventsSubstantive.slice(0, 8).map((ev, i) => ({
        i,
        title: ev.title?.slice(0, 80) ?? "",
        start: ev.start,
        cat: inferCalendarEventCategory(ev, profile?.calendarOpening ?? null),
      })),
    }, { correlationId });
  } else if (isOpening) {
    scheduleAppLog(AppLogScope.opening, "debug", "opening_topic_scores", {
      userId,
      entryId,
      threadId: threadId ?? null,
      entryDateYmd,
      calendarOk: calendarRes.ok,
      calendarFailReason: calendarRes.ok ? undefined : calendarRes.reason,
      calendarEventCount: calendarRes.ok ? calendarEventsSubstantive.length : 0,
      calendarRawCount: calendarRes.ok ? calendarEventsForOrchestrator.length : 0,
      jpHolidayNameJa,
      calendarHolidaySignalTitle: calendarHolidayTitle,
      primary: null,
      secondary: null,
      note: calendarRes.ok ? "no_events_for_day" : "calendar_unavailable",
    }, { correlationId });
  }

  const timetableOpeningFocusJa =
    isOpening &&
    diffCalendarDaysInZone(entryDateYmd, todayYmd, userTimeZone) === 0 &&
    profile?.occupationRole === "student" &&
    profile.studentTimetable?.trim()
      ? formatTimetableNextFocusForOpeningJa(
          profile.studentTimetable,
          entryDateYmd,
          orchestratorNow,
          profile.workLifeAnswers?.st_level ?? "",
        )
      : "";
  const hasTimetableLecturesToday = Boolean(timetableOpeningFocusJa);

  const sparseSchedule = isSparseSchedule({
    calendarLinked: calendarRes.ok,
    calendarEventCount: calendarRes.ok ? calendarPlanEventCount : 0,
    hasTimetableLecturesToday,
  });
  const hasInterestSignals = hasInterestProfileSignals(profile ?? {});
  const wallCalendarYmd = formatYmdInTimeZone(orchestratorNow, userTimeZone);

  const openingHint = buildOpeningHint(
    profile?.occupationRole,
    calendarAvailable,
    weather,
    persona,
    {
      omitCalendarWorkForNationalHolidayNoPlans: Boolean(
        jpHolidayNameJa && calendarPlanEventCount === 0,
      ),
      /** 開口ターンは関心タグがあるだけで query_hobby を推奨（趣味エージェント経由のグラウンディング・公式抜粋・将来のニュースAPI）。 */
      suggestHobbyForRichProfileLightDay: Boolean(
        hasInterestSignals && (sparseSchedule || Boolean(jpHolidayNameJa) || isOpening),
      ),
    },
  );

  const openingRecommendedForPrompt = openingHint.recommendedAgents.filter((n) => {
    if (n === "propose_settings_change") return Boolean(openingAllowSettingsTool);
    return !OPENING_OMIT_TOOLS.has(n);
  });

  const wallLat = weather.promptLat ?? DEFAULT_WEATHER_LATITUDE;
  const wallLon = weather.promptLon ?? DEFAULT_WEATHER_LONGITUDE;
  const wallClockBlockEn = formatOrchestratorWallClockDaylightBlock({
    entryDateYmd,
    now: orchestratorNow,
    lat: wallLat,
    lon: wallLon,
    timeZone: userTimeZone,
    dayBoundaryEndTime,
    beforeSunriseLectureHook:
      profile?.occupationRole === "student" && hasTimetableLecturesToday,
  });

  let jpAnniversarySystemBlock = "";
  if (!jpHolidayNameJa && sparseSchedule) {
    const names = getJpAnniversaryNamesForYmd(entryDateYmd);
    if (names?.length) {
      jpAnniversarySystemBlock = formatJpAnniversaryLocalSystemBlock(names, entryDateYmd, {
        showUserFacingAttribution: true,
      });
    }
  }

  let holidayTriviaSystemBlock = "";
  /** 実質タイムド予定が無い（またはカレンダー未取得で見えない）祝日に雑学を載せる。`calendarRes.ok` 必須だと連携失敗時に一切付かないため緩和する */
  const holidayTriviaEligible =
    Boolean(jpHolidayNameJa) &&
    (isOpening || sparseSchedule) &&
    (!calendarRes.ok || calendarPlanEventCount === 0);
  if (holidayTriviaEligible) {
    const triv = triviaLineForJapaneseHoliday(jpHolidayNameJa!);
    if (triv) {
      const soft = isOpening
        ? ((await paraphraseHolidayTriviaForOpening({
            holidayNameJa: jpHolidayNameJa!,
            builtinFact: triv,
          })) ?? triv)
        : triv;
      const openingTriviaGuide = isOpening
        ? [
            "「祝日メモ」があるときは**可能なら一文**、メモに書かれた**無難な豆知識**（連休の位置づけ・行事・季節の食べ物など）を会話に溶かす。祝日名だけでもよいが、**寂しい開口を避けるため**百科長文にはしない。**一文で済む雑学**を優先する。",
            "憲法記念日・即位礼・大喪の礼など、制度や思想に触れうる祝日は**由来・施行・条文の説明をしない**。その場合はメモのうち**連休・カレンダー上の位置づけ**だけか、祝日名のみ。百科調・「ゆるい空気」決めつけは禁止。",
            "説教調・長い解説は避ける。",
            hasInterestSignals
              ? "静的プロフィールの趣味・関心タグと**無理のない接続**があれば優先（タグにない話題は捏造しない）。"
              : "",
            "ユーザー画面にはこのブロックは出ない。断定せず、本文やユーザーの訂正を優先する。",
          ]
            .filter(Boolean)
            .join("\n")
        : "断定せず雑談程度に。由来の長い説明は避ける。本文やユーザーの訂正を優先する。";
      holidayTriviaSystemBlock = [
        "## 祝日メモ（参考）",
        `「${jpHolidayNameJa}」: ${soft}`,
        openingTriviaGuide,
      ].join("\n");
    }
  }

  const sparseThreadHintBlock =
    !isOpening && sparseSchedule && !topicDeepening
      ? formatOrchestratorSparseThreadHintBlock({
          isSparseSchedule: true,
          hasTimetableLecturesToday,
          occupationRole: profile?.occupationRole,
        })
      : "";

  const rawBody = (currentBody ?? "").trim();
  const bodyForPrompt =
    rawBody.length > DIARY_BODY_MAX_CHARS_ORCHESTRATOR
      ? `${rawBody.slice(0, DIARY_BODY_MAX_CHARS_ORCHESTRATOR)}…`
      : rawBody;

  const calendarBriefBody = calendarRes.ok
    ? formatOpeningDayCalendarBrief(
        calendarEventsSubstantive,
        calendarOrderedEvIdx,
        userTimeZone,
        profile?.calendarOpening,
      )
    : "";
  const calendarDayBriefForOrchestrator = calendarRes.ok
    ? `${ORCHESTRATOR_DAY_CALENDAR_HEADING}\n${calendarBriefBody}`
    : "";

  let toolFactCards: ToolFactCard[] = [
    weatherToToolFactCard(weather),
    calendarDayToToolFactCard({
      entryDateYmd,
      calendarOk: calendarRes.ok,
      substantiveEventCount: calendarEventsSubstantive.length,
      summaryJa: calendarBriefBody || (calendarRes.ok ? "（予定なし）" : "（カレンダー未取得）"),
    }),
  ];
  const todayReferentialFactsBlock = formatTodayReferentialFactsSection({
    cards: toolFactCards,
    humanNarrativeWeatherJa: formatWeatherForPrompt(weather),
    humanCalendarDayJa: calendarDayBriefForOrchestrator || undefined,
  });

  const policyVersion = isOpening
    ? resolvePolicyVersion("opening_default")
    : resolvePolicyVersion("reflective_chat_default");

  const baseSystem = loadAgentPrompt(getOrchestratorAgentPromptBasename());
  const holidayGuardBlock = jpHolidayNameJa
    ? [
        "## 祝日・休みの可能性（重要）",
        `このエントリ日（${entryDateYmd}）の祝日/休日シグナル（内閣府 syukujitsu.csv バンドル）: 「${jpHolidayNameJa}」`,
        "ルール: 時間割や推測があっても「講義があった」と断定しない。必要なら短く確認し、ユーザーが講義があったと言った場合にのみ講義の話題へ進む。",
        "上記の名前以外の祝日名をこの日に言い換えない（前日の祝日を当日にすり替えない）。",
      ].join("\n")
    : [
        "## 国民の祝日（このエントリ日）",
        `対象日 ${entryDateYmd} は、内閣府公開の祝日 CSV（syukujitsu.csv）由来バンドルでは **祝日・休日ラベルなし**。カレンダー一覧から、日付と整合しない国民祝日名の終日行はサーバ側で除外済み。`,
        "このブロックがあるときは、モデルは **いかなる国民の祝日名もこの日に付けない**（例: 4月30日を「昭和の日」と言わない）。前日が祝日でも名前言及を当日に移さない。",
      ].join("\n");
  let systemBlocks = [
    baseSystem,
    "",
    "## ペルソナ指示（最優先で遵守）",
    personaInstructions || "（未設定）",
    "",
    staticProfileBlock,
    "",
    mbtiHint ? `## MBTIヒント\n${mbtiHint}` : "",
    corrections.length > 0
      ? `## ユーザーの訂正メモ（断定を避けること）\n${corrections.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    formatOrchestratorTemporalBlock(entryDateYmd, orchestratorNow, temporalOpts),
    "",
    wallClockBlockEn,
    "",
    formatOrchestratorDayBoundaryBlock({
      entryDateYmd,
      now: orchestratorNow,
      dayBoundaryEndTime,
      timeZone: userTimeZone,
    }),
    "",
    formatOrchestratorScheduleGroundingBlock(),
    "",
    formatOrchestratorConversationScopeBlock(),
    "",
    !isOpening && typeof reflectiveUserTurnIncludingCurrent === "number"
      ? formatOrchestratorDiaryProposalGateBlock({
          userTurnsIncludingThis: reflectiveUserTurnIncludingCurrent,
          minUserTurnsBeforeDiaryProposal: diaryProposalMinUserTurns,
        })
      : "",
    !isOpening ? formatOrchestratorEventSceneFollowupBlock(eventFollowupIntensity) : "",
    "",
    todayReferentialFactsBlock,
    "",
    `## 対象日\n${formatYmdWithTokyoWeekday(entryDateYmd)}`,
    "",
    bodyForPrompt ? `## 本文（このエントリ）\n${bodyForPrompt}` : "",
    isOpening
      ? buildReflectiveOpeningSystemInstruction(
          entryDateYmd,
          orchestratorNow,
          {
            hasDiaryBody: rawBody.length > 0,
            calendarLinked: calendarRes.ok,
            calendarEventCount: calendarRes.ok ? calendarPlanEventCount : 0,
            hasTimetableLecturesToday,
            holidayNameJa: jpHolidayNameJa,
            isSparseSchedule: sparseSchedule,
            occupationRole: profile?.occupationRole,
            hasInterestSignals,
            hasMemorySnippets: Boolean(
              (longTermContext ?? "").trim() || (shortTermContext ?? "").trim(),
            ),
            wallCalendarYmd,
          },
          temporalOpts,
        )
      : "",
    isOpening && openingHint.openingNote ? `## 開口のヒント\n${openingHint.openingNote}` : "",
    isOpening && hasInterestSignals
      ? [
          "## 開口・関心タグ（query_hobby）",
          "プロフィールに関心タグ・趣味がある。**query_hobby** を **query_weather** と**同じツールラウンドで並列に呼ぶこと**（空でもよいがスキップしない）。返答では趣味エージェント結果の**検索グラウンディング・許可ドメイン公式抜粋・（設定されている場合）ニュースAPI**など、**根拠のある具体**を本文に**少なくともひとつ**自分の言葉で織り込む。タグ名や「映画・アニメ・YouTube」の列挙だけのテンプレにしない。ツール結果が薄いときは捏造しない。",
        ].join("\n")
      : "",
    isOpening && openingRecommendedForPrompt.length > 0
      ? `## 推奨エージェント（開口時・参考）\n${openingRecommendedForPrompt.join(", ")}`
      : "",
    isOpening && openingCalendarPriorityJa ? openingCalendarPriorityJa : "",
    isOpening && timetableOpeningFocusJa
      ? `## 時間割ベースのこの後の講義（Googleカレンダーに無いことが多い）\n${timetableOpeningFocusJa}`
      : "",
    holidayGuardBlock,
    "",
    isOpening && jpAnniversarySystemBlock ? jpAnniversarySystemBlock : "",
    isOpening && holidayTriviaSystemBlock ? holidayTriviaSystemBlock : "",
    !isOpening && sparseThreadHintBlock ? sparseThreadHintBlock : "",
    !isOpening && topicDeepening ? formatOrchestratorTopicDeepeningBlock() : "",
    "",
    !calendarAvailable
      ? "※ Google カレンダー未連携、またはトークン無効のためカレンダー系ツールは呼ばない。"
      : "",
    githubPromptBlock
      ? `## GitHub（このエントリ日・参考）\n${githubPromptBlock}\n\n※ コントリビューション数は GitHub 公式カレンダーの日付キー。活動の断定やプライバシー侵害にならないよう注意。`
      : "",
    githubToolEligible ? "※ GitHub 連携あり。**query_github** で同日の保存済み要約を会話に織り込める（捏造禁止）。" : "",
    profile?.occupationRole !== "student" ? "※ 学生ではないため query_school は呼ばない。" : "",
    avoidTopics.includes("romance")
      ? "※ ユーザーが恋愛の話題を避けたいため query_romance は絶対に呼ばない。"
      : "",
    longTermContext ? `## 長期プロフィール（ゆっくり変わる前提）\n${longTermContext}` : "",
    shortTermContext ? `## このエントリ日の短期メモ\n${shortTermContext}` : "",
    extraSystemAppend ? extraSystemAppend : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (useMini) {
    systemBlocks += [
      "",
      "## Brief-turn mode（軽量・低コスト）",
      "このターンのユーザー発言は短い確認／依頼のみと判定されている。**利用できるツールは `propose_settings_change` のみ**（日付区切り・TZ・カレンダー開口・AI 嗜好・時間割エディタ提案の保留）。天気・カレンダー・学校・GitHub など **query_* は呼ばない**。",
      "長文の日記草案はこの返答では書かず、**1〜3文**の自然な日本語で十分。必要ならユーザーに、右欄の「会話から草案を生成」で整形できることを**一文で**添えてよい。**意味のまとまりごとに改行してよい**（文数・分量は上のルールのまま、短くしない）。",
    ].join("\n");
  }

  let allowedTools = ORCHESTRATOR_TOOLS.filter((t) => {
    const name = t.function.name;
    if (name === "query_romance" && avoidTopics.includes("romance")) return false;
    if (name === "query_school" && profile?.occupationRole !== "student") return false;
    if (
      (name === "query_calendar_daily" ||
        name === "query_calendar_work" ||
        name === "query_calendar_social") &&
      !calendarAvailable
    )
      return false;
    if (name === "query_github" && !githubToolEligible) return false;
    return true;
  });

  if (isOpening) {
    allowedTools = allowedTools.filter((t) => {
      const name = t.function.name;
      if (name === "propose_settings_change" && openingAllowSettingsTool) return true;
      return !OPENING_OMIT_TOOLS.has(name);
    });
  }

  if (useMini) {
    allowedTools = allowedTools.filter((t) => t.function.name === "propose_settings_change");
  }

  const openai = getOpenAI();
  const agentsUsed: string[] = [];

  const messages: ChatMsg[] = [{ role: "system", content: systemBlocks }, ...historyMessages];

  if (isOpening) {
    messages.push({ role: "user", content: OPENING_TURN_USER_MESSAGE });
  } else if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  const toolUserFallback = isOpening ? OPENING_TOOL_USER_FALLBACK : userMessage;

  if (allowedTools.length > 0) {
    let loopCount = 0;
    while (loopCount < 3) {
      loopCount++;

      const { result: nonStreamRes } = await withChatModelFallbackAndModel(
        primaryModel,
        fallbackModel,
        (model) =>
          openai.chat.completions.create({
            model,
            messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
            tools: allowedTools as Parameters<typeof openai.chat.completions.create>[0]["tools"],
            tool_choice: loopCount === 1 ? "auto" : "none",
            ...chatCompletionOutputTokenLimit(model, ORCHESTRATOR_TOOL_ROUND_MAX_TOKENS),
            ...(isOpening ? orchestratorOpeningSamplingParams(model) : {}),
          }),
      );

      const choice = nonStreamRes.choices[0];
      if (!choice) break;

      const assistantMsg = choice.message;
      messages.push({
        role: "assistant",
        content: assistantMsg.content ?? "",
        ...(assistantMsg.tool_calls ? { tool_calls: assistantMsg.tool_calls } : {}),
      });

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) break;

      const dynamicToolFactCards: ToolFactCard[] = [];

      const toolCallPromises = assistantMsg.tool_calls.map(async (tc) => {
        if (!("function" in tc)) {
          return { tool_call_id: tc.id, content: "（未対応のツール形式）" };
        }
        const toolName = (tc as { id: string; function: { name: string; arguments: string } }).function.name;
        agentsUsed.push(toolName);

        let rawArgs: Record<string, unknown> = {};
        try {
          rawArgs = JSON.parse(
            (tc as { id: string; function: { name: string; arguments: string } }).function.arguments || "{}",
          ) as Record<string, unknown>;
        } catch {
          rawArgs = {};
        }
        const focus = typeof rawArgs.focus === "string" ? rawArgs.focus : undefined;

        const baseReq: AgentRequest = {
          userId,
          entryId,
          entryDateYmd,
          userMessage: focus ?? toolUserFallback,
          persona,
          longTermContext: longTermContext || undefined,
          agentMemory: {},
          calendarOpening: profile?.calendarOpening ?? null,
        };

        let toolResult = "";

        if (toolName === "query_weather") {
          toolResult = formatWeatherToolReply(weatherText, weather);
        } else if (toolName === "query_school") {
          const mem = await loadAgentMemory(userId, "school");
          const res = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "school",
            userId,
            runFn: runSchoolAgent,
          });
          toolResult = res.text;
          dynamicToolFactCards.push(...res.factCards);
        } else if (toolName === "query_calendar_daily") {
          const mem = await loadAgentMemory(userId, "calendar_daily");
          const res = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "calendar_daily",
            userId,
            runFn: runCalendarDailyAgent,
          });
          toolResult = res.text;
          dynamicToolFactCards.push(...res.factCards);
        } else if (toolName === "query_calendar_work") {
          const mem = await loadAgentMemory(userId, "calendar_work");
          const res = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "calendar_work",
            userId,
            runFn: runCalendarWorkAgent,
          });
          toolResult = res.text;
          dynamicToolFactCards.push(...res.factCards);
        } else if (toolName === "query_calendar_social") {
          const mem = await loadAgentMemory(userId, "calendar_social");
          const res = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "calendar_social",
            userId,
            runFn: runCalendarSocialAgent,
          });
          toolResult = res.text;
          dynamicToolFactCards.push(...res.factCards);
        } else if (toolName === "query_hobby") {
          const mem = await loadAgentMemory(userId, "hobby");
          toolResult = (
            await callAgent({
              req: { ...baseReq, agentMemory: mem },
              domain: "hobby",
              userId,
              runFn: runHobbyAgent,
            })
          ).text;
        } else if (toolName === "query_romance") {
          if (!avoidTopics.includes("romance")) {
            const mem = await loadAgentMemory(userId, "romance");
            toolResult = (
              await callAgent({
                req: { ...baseReq, agentMemory: mem },
                domain: "romance",
                userId,
                runFn: runRomanceAgent,
              })
            ).text;
          } else {
            toolResult = "（恋愛トピックは除外設定済み）";
          }
        } else if (toolName === "query_github") {
          toolResult = (
            await callAgent({
              req: { ...baseReq, agentMemory: {} },
              domain: "github",
              userId,
              runFn: runGithubAgent,
            })
          ).text;
        } else if (toolName === "propose_settings_change") {
          toolResult = await runProposeSettingsChangeTool({ rawArgs, threadId: threadId ?? null });
        } else {
          toolResult = "（未対応のツール）";
        }

        return { tool_call_id: tc.id, content: toolResult };
      });

      const toolResults = await Promise.all(toolCallPromises);
      for (const tr of toolResults) {
        messages.push({ role: "tool", content: tr.content, tool_call_id: tr.tool_call_id });
      }

      if (dynamicToolFactCards.length > 0) {
        toolFactCards = clipToolFactCards([...toolFactCards, ...dynamicToolFactCards]);
        const refreshedToday = formatTodayReferentialFactsSection({
          cards: toolFactCards,
          humanNarrativeWeatherJa: formatWeatherForPrompt(weather),
          humanCalendarDayJa: calendarDayBriefForOrchestrator || undefined,
        });
        systemBlocks = replaceOrchestratorTodayFactsSection(systemBlocks, refreshedToday);
        messages[0] = { role: "system", content: systemBlocks };
      }
    }
  }

  const { result: stream, model: orchestratorModel } = await withChatModelFallbackAndModel(
    primaryModel,
    fallbackModel,
    (model) =>
      openai.chat.completions.create({
        model,
        stream: true,
        messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        ...chatCompletionOutputTokenLimit(
          model,
          isOpening ? ORCHESTRATOR_STREAM_MAX_TOKENS_OPENING : ORCHESTRATOR_STREAM_MAX_TOKENS,
        ),
        ...(isOpening ? orchestratorOpeningSamplingParams(model) : {}),
      }),
  );

  return {
    stream,
    agentsUsed: [...new Set(agentsUsed)],
    personaInstructions,
    mbtiHint,
    orchestratorModel,
    correlationId,
    policyVersion,
    toolFactCards,
  };
}

// --- triggerSupervisorAsync ---

export function triggerSupervisorAsync(params: {
  userId: string;
  threadId: string;
  agentsUsed: string[];
  recentMessages: { role: string; content: string }[];
  personaInstructions: string;
  mbtiHint?: string;
}): void {
  runSupervisorAgent({
    userId: params.userId,
    threadId: params.threadId,
    agentsUsed: params.agentsUsed,
    recentMessages: params.recentMessages,
    personaInstructions: params.personaInstructions,
    mbtiHint: params.mbtiHint,
  }).catch(() => {});
}
