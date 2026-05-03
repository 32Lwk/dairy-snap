/**
 * オーケストレーター向け: ツール由来の事実を小さな JSON カードに正規化し、プロンプトに注入する。
 * @see メモリ・ツール・評価基盤計画
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import type { WeatherContext } from "@/server/agents/types";

export const toolFactSourceSchema = z.enum([
  "weather",
  "gcal_day_summary",
  "gcal_event",
  "school",
  "memory_search",
  "hobby",
  "romance",
  "other",
]);

export type ToolFactSource = z.infer<typeof toolFactSourceSchema>;

export const toolFactConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ToolFactConfidence = z.infer<typeof toolFactConfidenceSchema>;

export const toolFactCitationSchema = z.object({
  kind: z.enum(["url", "gcal_event", "internal"]),
  ref: z.string().max(2048),
});

export type ToolFactCitation = z.infer<typeof toolFactCitationSchema>;

export const toolFactCardSchema = z.object({
  source: toolFactSourceSchema,
  /** エントリ暦日または取得基準日（YYYY-MM-DD） */
  asOf: z.string().max(16),
  confidence: toolFactConfidenceSchema,
  /** ツール固有の短いペイロード（長文禁止 — 正規化側で切る） */
  payload: z.record(z.string(), z.unknown()).default({}),
  citations: z.array(toolFactCitationSchema).max(8).optional(),
});

export type ToolFactCard = z.infer<typeof toolFactCardSchema>;

const MAX_PAYLOAD_STRING = 480;
const MAX_CARDS_DEFAULT = 12;

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function shrinkPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string") {
      out[k] = truncateStr(v, MAX_PAYLOAD_STRING);
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 24);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 天気コンテキストを 1 枚の ToolFactCard に変換 */
export function weatherToToolFactCard(weather: WeatherContext): ToolFactCard {
  const confidence: ToolFactConfidence =
    weather.source === "none" ? "low" : weather.source === "db_cached" ? "high" : "medium";
  return toolFactCardSchema.parse({
    source: "weather",
    asOf: weather.dateYmd,
    confidence,
    payload: shrinkPayload({
      amLabel: weather.amLabel,
      pmLabel: weather.pmLabel,
      amTempC: weather.amTempC,
      pmTempC: weather.pmTempC,
      dataSource: weather.source,
      narrativeHint: weather.narrativeHint ? truncateStr(weather.narrativeHint, 320) : "",
    }),
  });
}

export type CalendarDayCardInput = {
  entryDateYmd: string;
  calendarOk: boolean;
  substantiveEventCount: number;
  /** モデル用の短い要約（一覧の先頭付近のみ） */
  summaryJa: string;
};

export function calendarDayToToolFactCard(input: CalendarDayCardInput): ToolFactCard {
  const confidence: ToolFactConfidence = input.calendarOk
    ? input.substantiveEventCount > 0
      ? "high"
      : "medium"
    : "low";
  return toolFactCardSchema.parse({
    source: "gcal_day_summary",
    asOf: input.entryDateYmd,
    confidence,
    payload: shrinkPayload({
      calendarOk: input.calendarOk,
      substantiveEventCount: input.substantiveEventCount,
      summaryJa: truncateStr(input.summaryJa.trim(), 900),
    }),
  });
}

/** query_school の応答を ToolFactCard に正規化（エラー時は confidence low） */
/** query_calendar_* エージェントの応答を参照事実カード化（source は `other` + payload.calendarAgent） */
export function calendarAgentReplyToToolFactCard(
  agent: "daily" | "work" | "social",
  entryDateYmd: string,
  answer: string,
  hasRelevantInfo: boolean,
  agentError?: string,
): ToolFactCard {
  if (agentError?.trim()) {
    return toolFactCardSchema.parse({
      source: "other",
      asOf: entryDateYmd,
      confidence: "low",
      payload: shrinkPayload({
        calendarAgent: agent,
        agentError: truncateStr(agentError.trim(), 240),
      }),
    });
  }
  const confidence: ToolFactConfidence = hasRelevantInfo ? "medium" : "low";
  return toolFactCardSchema.parse({
    source: "other",
    asOf: entryDateYmd,
    confidence,
    payload: shrinkPayload({
      calendarAgent: agent,
      excerptJa: truncateStr(answer.replace(/\s+/g, " ").trim(), MAX_PAYLOAD_STRING),
    }),
  });
}

export function schoolAgentReplyToToolFactCard(
  entryDateYmd: string,
  answer: string,
  hasRelevantInfo: boolean,
  agentError?: string,
): ToolFactCard {
  if (agentError?.trim()) {
    return toolFactCardSchema.parse({
      source: "school",
      asOf: entryDateYmd,
      confidence: "low",
      payload: shrinkPayload({ agentError: truncateStr(agentError.trim(), 240) }),
    });
  }
  const confidence: ToolFactConfidence = hasRelevantInfo ? "medium" : "low";
  return toolFactCardSchema.parse({
    source: "school",
    asOf: entryDateYmd,
    confidence,
    payload: shrinkPayload({
      excerptJa: truncateStr(answer.replace(/\s+/g, " ").trim(), MAX_PAYLOAD_STRING),
    }),
  });
}

/** カード配列の安定ダイジェスト（ログ・スナップショット用） */
export function digestToolFactCards(cards: ToolFactCard[]): string {
  const normalized = cards.map((c) => toolFactCardSchema.parse(c));
  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex").slice(0, 32);
}

export function clipToolFactCards(cards: ToolFactCard[], maxCards: number = MAX_CARDS_DEFAULT): ToolFactCard[] {
  return cards.slice(0, maxCards).map((c) => {
    const p = toolFactCardSchema.parse(c);
    return { ...p, payload: shrinkPayload(p.payload as Record<string, unknown>) };
  });
}

export type TodayReferentialFactsSectionOpts = {
  cards: ToolFactCard[];
  /** 従来どおりの天気ナラティブ（モデル可読） */
  humanNarrativeWeatherJa: string;
  /** この日のカレンダー一覧テキスト（見出し含む可） */
  humanCalendarDayJa?: string;
  /** structured JSON 部分の最大文字数（超過時はカードを落とす） */
  maxJsonChars?: number;
};

/**
 * 「今日の参照事実」ブロック: structured JSON + 人間可読サマリ。
 */
export function formatTodayReferentialFactsSection(opts: TodayReferentialFactsSectionOpts): string {
  const maxJsonChars = opts.maxJsonChars ?? 3600;
  let cards = clipToolFactCards(opts.cards);
  let json = JSON.stringify(cards);
  while (json.length > maxJsonChars && cards.length > 1) {
    cards = cards.slice(0, cards.length - 1);
    json = JSON.stringify(cards);
  }
  if (json.length > maxJsonChars) {
    json = JSON.stringify([{ ...cards[0]!, payload: { truncated: true } }]);
  }

  const lines = [
    "## 今日の参照事実（structured）",
    "次の JSON はサーバが正規化した参照事実です。**カードに無い事柄は事実として断定しない。**",
    "```json",
    json,
    "```",
    "",
    "### 人間可読サマリ（天気・補足）",
    opts.humanNarrativeWeatherJa.trim() || "（天気サマリなし）",
  ];
  if (opts.humanCalendarDayJa?.trim()) {
    lines.push("", "### 人間可読サマリ（この日の予定一覧）", opts.humanCalendarDayJa.trim());
  }
  return lines.join("\n");
}
