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
  getEffectiveTodayYmd,
  resolveDayBoundaryEndTime,
  resolveUserTimeZone,
} from "@/lib/time/user-day-boundary";
import { formatOrchestratorStaticProfileBlock, parseUserSettings } from "@/lib/user-settings";
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
  formatOrchestratorTemporalBlock,
  formatOrchestratorWallClockDaylightBlock,
  ORCHESTRATOR_DAY_CALENDAR_HEADING,
} from "@/lib/time/entry-temporal-context";
import { getJapaneseHolidayNameJa } from "@/lib/jp-holiday";
import { DEFAULT_WEATHER_LATITUDE, DEFAULT_WEATHER_LONGITUDE } from "@/lib/location-defaults";
import {
  formatOrchestratorDiaryProposalGateBlock,
  formatOrchestratorEventSceneFollowupBlock,
  getDiaryProposalMinUserTurns,
  getEventSceneFollowupIntensity,
} from "@/lib/reflective-chat-diary-nudge-rules";
import { loadAgentPrompt } from "@/server/agents/utils";
import { getWeatherContext, formatWeatherForPrompt, formatWeatherToolReply } from "@/server/agents/weather-tool";
import { runSchoolAgent } from "@/server/agents/school-agent";
import { runCalendarDailyAgent } from "@/server/agents/calendar-daily-agent";
import { runCalendarWorkAgent } from "@/server/agents/calendar-work-agent";
import { runCalendarSocialAgent } from "@/server/agents/calendar-social-agent";
import { runHobbyAgent } from "@/server/agents/hobby-agent";
import { runRomanceAgent } from "@/server/agents/romance-agent";
import { runSupervisorAgent } from "@/server/agents/supervisor-agent";
import type { AgentRequest, PersonaContext, WeatherContext } from "@/server/agents/types";
import { ORCHESTRATOR_TOOLS } from "@/server/agents/types";
import { loadShortTermContextForEntry } from "@/server/mas-memory";
import { scoreOpeningTopic } from "@/server/chat-context";
import { runProposeSettingsChangeTool } from "@/server/agents/settings-agent";

const OPENING_OMIT_TOOLS = new Set([
  "query_weather",
  "query_calendar_daily",
  "query_calendar_work",
  "query_calendar_social",
  "propose_settings_change",
]);

/** Opening chat user line: avoids a lone "." which often elicits meta / "system will…" preambles. */
const OPENING_TURN_USER_MESSAGE = "Begin the opening turn.";
/** Sub-agents during opening: keep a neutral non-empty cue (some models echo "." oddly). */
const OPENING_TOOL_USER_FALLBACK = " ";

const ORCHESTRATOR_TOOL_ROUND_MAX_TOKENS = 2048;
const ORCHESTRATOR_STREAM_MAX_TOKENS = 2048;
/** 開口の最終ストリーム: 短文でも `max_completion_tokens` が推論と表示で割られるモデル向けに余裕を確保 */
const ORCHESTRATOR_STREAM_MAX_TOKENS_OPENING = 4096;
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

function formatOneOpeningCalendarLine(ev: CalendarEventBrief, timeZone: string): string {
  const t = hhmmInUserZoneBrief(ev.start, timeZone);
  const when = t || "終日";
  const loc = ev.location?.trim() ? ` @${ev.location.trim()}` : "";
  const title = ev.title?.trim() || "（タイトルなし）";
  return `- ${when} ${title}${loc}`;
}

/** `orderedEvIdx`: 開口時は Impact×近さでソートした event インデックス（先頭ほど優先） */
function formatOpeningDayCalendarBrief(
  events: CalendarEventBrief[],
  orderedEvIdx: number[] | undefined,
  timeZone: string,
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
      lines.push(formatOneOpeningCalendarLine(events[i]!, timeZone));
      if (lines.length >= max) break;
    }
  }
  for (let i = 0; i < events.length && lines.length < max; i++) {
    if (used.has(i)) continue;
    lines.push(formatOneOpeningCalendarLine(events[i]!, timeZone));
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

function buildOpeningHint(
  occupationRole: string | undefined,
  hasCalendar: boolean,
  weather: WeatherContext,
  persona: PersonaContext,
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
  } else if (occupationRole) {
    agents.push("query_calendar_work");
  }

  const mbti = persona.mbti ?? "";
  const isEF = mbti.startsWith("E") && mbti[2] === "F";
  if (isEF) {
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

async function callAgent({ req, domain, userId, runFn }: AgentCallArgs): Promise<string> {
  try {
    const result = await runFn(req);
    if (result.updatedMemory && Object.keys(result.updatedMemory).length > 0) {
      await saveAgentMemory(userId, domain, result.updatedMemory).catch(() => {});
    }
    return result.answer || "（該当情報なし）";
  } catch (e) {
    return `（エージェントエラー: ${String(e).slice(0, 80)}）`;
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
    preferMiniOrchestrator,
    clockNow,
    threadId,
    extraSystemAppend,
    openingAllowSettingsTool,
  } = params;

  const orchestratorNow = clockNow ?? new Date();
  const useMini = Boolean(preferMiniOrchestrator) && !isOpening;
  let primaryModel = isOpening ? getOrchestratorOpeningChatModel() : getOrchestratorChatModel();
  let fallbackModel = isOpening ? getOrchestratorOpeningChatFallbackModel() : getOrchestratorChatFallbackModel();
  if (useMini) {
    primaryModel = getAgentSocialMiniChatModel();
    fallbackModel = getAgentSocialMiniChatFallbackModel();
  }

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

  const [longTermContext, shortTermContext, weather, calendarRes] = await Promise.all([
    loadLongTermContext(userId),
    loadShortTermContextForEntry(userId, entryId),
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
        }),
      }),
    ),
    fetchCalendarEventsForDay(userId, entryDateYmd),
  ]);
  const calendarAvailable = isCalendarToolEligible(calendarRes);
  const holidaySignal =
    calendarRes.ok && calendarRes.events.length > 0 ? detectHolidaySignal(calendarRes.events) : null;
  // Calendar may be unavailable or may not include a holiday calendar. Fall back to date-based JP holiday check.
  const jpHolidayNameJa =
    (holidaySignal?.hasHolidayLikeAllDay ? holidaySignal.titles[0] ?? null : null) ??
    getJapaneseHolidayNameJa(entryDateYmd);

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

  const diaryProposalMinUserTurns = getDiaryProposalMinUserTurns({
    aiDepthLevel: profile?.aiDepthLevel,
    aiChatTone: profile?.aiChatTone,
  });
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

  const openingHint = buildOpeningHint(
    profile?.occupationRole,
    calendarAvailable,
    weather,
    persona,
  );

  const openingRecommendedForPrompt = openingHint.recommendedAgents.filter((n) => {
    if (n === "propose_settings_change") return Boolean(openingAllowSettingsTool);
    return !OPENING_OMIT_TOOLS.has(n);
  });

  let calendarOrderedEvIdx: number[] | undefined;
  let openingCalendarPriorityJa = "";
  if (isOpening && calendarRes.ok && calendarRes.events.length > 0) {
    const sco = scoreOpeningTopic({
      dayEvents: calendarRes.events,
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

  const rawBody = (currentBody ?? "").trim();
  const bodyForPrompt =
    rawBody.length > DIARY_BODY_MAX_CHARS_ORCHESTRATOR
      ? `${rawBody.slice(0, DIARY_BODY_MAX_CHARS_ORCHESTRATOR)}…`
      : rawBody;

  const weatherSectionTitle =
    diffCalendarDaysInZone(entryDateYmd, todayYmd, userTimeZone) === 0
      ? "## 今日の天気"
      : `## エントリ日（${formatYmdWithTokyoWeekday(entryDateYmd)}）の天気`;

  const baseSystem = loadAgentPrompt("orchestrator");
  const holidayGuardBlock =
    jpHolidayNameJa
      ? [
          "## 祝日・休みの可能性（重要）",
          `この日は祝日/休日の可能性がある: 「${jpHolidayNameJa}」`,
          "ルール: 時間割や推測があっても「講義があった」と断定しない。必要なら短く確認し、ユーザーが講義があったと言った場合にのみ講義の話題へ進む。",
        ].join("\n")
      : "";
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
    weather.wallClockDaylightBlockEn ?? "",
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
    weatherSectionTitle,
    weatherText,
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
            calendarEventCount: calendarRes.ok ? calendarRes.events.length : 0,
            hasTimetableLecturesToday,
            holidayNameJa: jpHolidayNameJa,
          },
          temporalOpts,
        )
      : "",
    isOpening && openingHint.openingNote ? `## 開口のヒント\n${openingHint.openingNote}` : "",
    isOpening && openingRecommendedForPrompt.length > 0
      ? `## 推奨エージェント（開口時・参考）\n${openingRecommendedForPrompt.join(", ")}`
      : "",
    isOpening && openingCalendarPriorityJa ? openingCalendarPriorityJa : "",
    isOpening && timetableOpeningFocusJa
      ? `## 時間割ベースのこの後の講義（Googleカレンダーに無いことが多い）\n${timetableOpeningFocusJa}`
      : "",
    calendarRes.ok
      ? `${ORCHESTRATOR_DAY_CALENDAR_HEADING}\n${formatOpeningDayCalendarBrief(calendarRes.events, calendarOrderedEvIdx, userTimeZone)}`
      : "",
    holidayGuardBlock,
    "",
    !calendarAvailable
      ? "※ Google カレンダー未連携、またはトークン無効のためカレンダー系ツールは呼ばない。"
      : "",
    profile?.occupationRole !== "student" ? "※ 学生ではないため query_school は呼ばない。" : "",
    avoidTopics.includes("romance")
      ? "※ ユーザーが恋愛の話題を避けたいため query_romance は絶対に呼ばない。"
      : "",
    longTermContext ? `## 長期記憶（参考）\n${longTermContext}` : "",
    shortTermContext ? `## 短期（この日・参考）\n${shortTermContext}` : "",
    extraSystemAppend ? extraSystemAppend : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (useMini) {
    systemBlocks += [
      "",
      "## Brief-turn mode（軽量・低コスト）",
      "このターンのユーザー発言は短い確認／依頼のみと判定されている。**ツールは一切呼ばない**（query_weather / query_* も不可）。",
      "長文の日記草案はこの返答では書かず、**1〜3文**の自然な日本語で十分。必要ならユーザーに、右欄の「会話から草案を生成」で整形できることを**一文で**添えてよい。",
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
    allowedTools = [];
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
        };

        let toolResult = "";

        if (toolName === "query_weather") {
          toolResult = formatWeatherToolReply(weatherText, weather);
        } else if (toolName === "query_school") {
          const mem = await loadAgentMemory(userId, "school");
          toolResult = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "school",
            userId,
            runFn: runSchoolAgent,
          });
        } else if (toolName === "query_calendar_daily") {
          const mem = await loadAgentMemory(userId, "calendar_daily");
          toolResult = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "calendar_daily",
            userId,
            runFn: runCalendarDailyAgent,
          });
        } else if (toolName === "query_calendar_work") {
          const mem = await loadAgentMemory(userId, "calendar_work");
          toolResult = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "calendar_work",
            userId,
            runFn: runCalendarWorkAgent,
          });
        } else if (toolName === "query_calendar_social") {
          const mem = await loadAgentMemory(userId, "calendar_social");
          toolResult = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "calendar_social",
            userId,
            runFn: runCalendarSocialAgent,
          });
        } else if (toolName === "query_hobby") {
          const mem = await loadAgentMemory(userId, "hobby");
          toolResult = await callAgent({
            req: { ...baseReq, agentMemory: mem },
            domain: "hobby",
            userId,
            runFn: runHobbyAgent,
          });
        } else if (toolName === "query_romance") {
          if (!avoidTopics.includes("romance")) {
            const mem = await loadAgentMemory(userId, "romance");
            toolResult = await callAgent({
              req: { ...baseReq, agentMemory: mem },
              domain: "romance",
              userId,
              runFn: runRomanceAgent,
            });
          } else {
            toolResult = "（恋愛トピックは除外設定済み）";
          }
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
