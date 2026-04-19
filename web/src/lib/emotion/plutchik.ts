import { z } from "zod";

/** タイブレーク順（同スコア時はこの順で先頭を dominant とする）。円環の時計回りに対応。 */
export const PLUTCHIK_PRIMARY_ORDER = [
  "anticipation",
  "joy",
  "trust",
  "fear",
  "surprise",
  "sadness",
  "disgust",
  "anger",
] as const;

export type PlutchikPrimaryKey = (typeof PLUTCHIK_PRIMARY_ORDER)[number];

const primaryKeySchema = z.enum([
  "anticipation",
  "joy",
  "trust",
  "fear",
  "surprise",
  "sadness",
  "disgust",
  "anger",
]);

const primaryEntrySchema = z.object({
  score: z.number().int().min(0).max(100),
  noteJa: z.union([z.string().max(400), z.null()]),
});

const primaryMapSchema = z.object({
  anticipation: primaryEntrySchema,
  joy: primaryEntrySchema,
  trust: primaryEntrySchema,
  fear: primaryEntrySchema,
  surprise: primaryEntrySchema,
  sadness: primaryEntrySchema,
  disgust: primaryEntrySchema,
  anger: primaryEntrySchema,
});

/** LLM が返すルート（Structured Outputs 用）。 */
export const plutchikLlmRootSchema = z.object({
  summaryJa: z.string().min(1).max(1200),
  primary: primaryMapSchema,
});

export type PlutchikLlmOutput = z.infer<typeof plutchikLlmRootSchema>;

const usageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative().optional(),
});

/** DB に保存する完全形。 */
export const plutchikStoredAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  computedAt: z.string().min(1),
  model: z.string().min(1),
  threadId: z.string().min(1),
  promptVersion: z.string().min(1),
  summaryJa: z.string().min(1).max(1200),
  primary: primaryMapSchema,
  usage: usageSchema,
});

export type PlutchikStoredAnalysis = z.infer<typeof plutchikStoredAnalysisSchema>;

export const PLUTCHIK_LABEL_JA: Record<PlutchikPrimaryKey, string> = {
  anticipation: "期待",
  joy: "喜び",
  trust: "信頼",
  fear: "恐れ",
  surprise: "驚き",
  sadness: "悲しみ",
  disgust: "嫌悪",
  anger: "怒り",
};

/** SVG / UI 用（プルチック系配色の近似）。 */
export const PLUTCHIK_COLOR: Record<PlutchikPrimaryKey, string> = {
  anticipation: "#f9a825",
  joy: "#ffeb3b",
  trust: "#aed581",
  fear: "#43a047",
  surprise: "#29b6f6",
  sadness: "#5c6bc0",
  disgust: "#ab47bc",
  anger: "#ef5350",
};

function emotionJsonSchemaProperties(): Record<string, unknown> {
  return {
    score: { type: "integer", minimum: 0, maximum: 100 },
    noteJa: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  };
}

const emotionRequired = ["score", "noteJa"] as const;

function primarySchemaStrict(): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const k of PLUTCHIK_PRIMARY_ORDER) {
    props[k] = {
      type: "object",
      properties: emotionJsonSchemaProperties(),
      required: [...emotionRequired],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: props,
    required: [...PLUTCHIK_PRIMARY_ORDER],
    additionalProperties: false,
  };
}

/** OpenAI Chat Completions `response_format.json_schema` 用（strict: true）。 */
export const PLUTCHIK_LLM_JSON_SCHEMA = {
  name: "plutchik_emotion_v1",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summaryJa: { type: "string" },
      primary: primarySchemaStrict(),
    },
    required: ["summaryJa", "primary"],
    additionalProperties: false,
  },
} as const;

export function dominantPlutchikKey(primary: PlutchikLlmOutput["primary"]): PlutchikPrimaryKey {
  let max = -1;
  for (const k of PLUTCHIK_PRIMARY_ORDER) {
    const s = primary[k].score;
    if (s > max) max = s;
  }
  for (const k of PLUTCHIK_PRIMARY_ORDER) {
    if (primary[k].score === max) return k;
  }
  return "anticipation";
}

export function parsePlutchikLlmJson(raw: string): { ok: true; data: PlutchikLlmOutput } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const r = plutchikLlmRootSchema.safeParse(parsed);
  if (!r.success) return { ok: false, error: "schema_mismatch" };
  return { ok: true, data: r.data };
}

export function parsePlutchikStoredJson(raw: unknown): { ok: true; data: PlutchikStoredAnalysis } | { ok: false } {
  const r = plutchikStoredAnalysisSchema.safeParse(raw);
  if (!r.success) return { ok: false };
  return { ok: true, data: r.data };
}

export function isPlutchikPrimaryKey(s: string): s is PlutchikPrimaryKey {
  return (PLUTCHIK_PRIMARY_ORDER as readonly string[]).includes(s);
}

export function safeParsePrimaryKey(s: string | null | undefined): PlutchikPrimaryKey | null {
  if (!s) return null;
  const r = primaryKeySchema.safeParse(s);
  return r.success ? r.data : null;
}
