import { z } from "zod";

/**
 * アカウント引き継ぎバンドルの構造（v1）。
 *
 * バンドルファイルの実体は JWE (PBES2-HS256+A256KW + A256GCM) で暗号化された
 * バイナリコンテナ。コンテナの中身は次の構造を持つ:
 *
 *   [4 bytes BE uint32: header JSON length]
 *   [N bytes UTF-8: header JSON ('TransferContainerHeader')]
 *   [M bytes: body = data.json (UTF-8) + 各 blob のバイト列を順次連結]
 *
 * `header.dataLen` が data.json の長さ。続いて `header.blobs[i]` の順に
 * blob バイト列が並ぶ。
 *
 * 暗号化前バイナリのサイズには上限あり（{@link MAX_BUNDLE_PLAINTEXT_BYTES}）。
 */

/** 暗号化前バイナリの最大サイズ（200MB） */
export const MAX_BUNDLE_PLAINTEXT_BYTES = 200 * 1024 * 1024;

/** バンドルスキーマのバージョン */
export const BUNDLE_SCHEMA_VERSION = "v1" as const;

/** ファイル先頭のマジックタグ（生成側のみ。復号後の JSON ではなくコンテナ内に置く） */
export const BUNDLE_MAGIC = "DSBNDLv1" as const;

/** バイナリコンテナの header（data.json と blob 領域のレイアウトを記述） */
export const transferContainerHeaderSchema = z.object({
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  /** data.json (UTF-8) のバイト長 */
  dataLen: z.number().int().nonnegative(),
  /** body における blob の並び。dataLen 直後に blobs[0] のバイト列、続いて blobs[1] ... */
  blobs: z.array(
    z.object({
      /** ソース DB 上での Image.storageKey（インポート時にキー書き換えに使用） */
      sourceStorageKey: z.string().min(1).max(2048),
      length: z.number().int().nonnegative(),
      mimeType: z.string().min(1).max(200),
      sha256: z.string().min(1).max(128),
    }),
  ),
});

export type TransferContainerHeader = z.infer<typeof transferContainerHeaderSchema>;

/* ---------------------- data.json の JSON スキーマ ---------------------- */

const isoDateString = z.string().min(1).max(64);

const sourceUserHintSchema = z.object({
  userIdHash: z.string().min(1).max(128),
  emailMasked: z.string().min(1).max(320),
});

const exportedUserSchema = z.object({
  name: z.string().nullable(),
  image: z.string().nullable(),
  timeZone: z.string().min(1).max(120),
  encryptionMode: z.enum(["STANDARD", "EXPERIMENTAL_E2EE"]),
  /** 任意 JSON。インポート時にトップレベルキー単位で衝突解決 */
  settings: z.record(z.string(), z.unknown()),
});

const dailyEntryRowSchema = z.object({
  id: z.string(),
  entryDateYmd: z.string(),
  title: z.string().nullable(),
  mood: z.string().nullable(),
  body: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  weatherPeriod: z.enum(["AM", "PM"]).nullable(),
  weatherJson: z.unknown().nullable(),
  encryptionMode: z.literal("STANDARD"),
  encryptionMeta: z.unknown(),
  plutchikAnalysis: z.unknown().nullable(),
  dominantEmotion: z.string().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const entryAppendEventRowSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  occurredAt: isoDateString,
  fragment: z.string(),
  createdAt: isoDateString,
});

const imageRowSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  kind: z.enum(["UPLOADED", "GENERATED"]),
  /** ソース DB 上の storageKey。インポート時に書き換える */
  storageKey: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().nullable(),
  googleMediaItemId: z.string().nullable(),
  rotationQuarterTurns: z.number().int(),
  caption: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: isoDateString,
});

const googlePhotoSelectionRowSchema = z.object({
  id: z.string(),
  entryId: z.string().nullable(),
  entryDateYmd: z.string(),
  providerSessionId: z.string().nullable(),
  mediaItemId: z.string(),
  baseUrl: z.string(),
  productUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  filename: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  creationTime: isoDateString.nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const tagRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoDateString,
});

const entryTagRowSchema = z.object({
  entryId: z.string(),
  tagId: z.string(),
});

const googleCalendarEventCacheRowSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  eventId: z.string(),
  calendarName: z.string().nullable(),
  calendarColorId: z.string().nullable(),
  eventColorId: z.string().nullable(),
  title: z.string(),
  location: z.string(),
  description: z.string(),
  eventPayload: z.unknown().nullable(),
  eventSearchBlob: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  startAt: isoDateString,
  endAt: isoDateString,
  fixedCategory: z.string().nullable(),
  isCancelled: z.boolean(),
  updatedAtGcal: isoDateString.nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const googleCalendarSyncStateRowSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  lastSyncAt: isoDateString.nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const appLocalCalendarRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const appLocalCalendarEventRowSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  startAt: isoDateString,
  endAt: isoDateString,
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const chatThreadRowSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  title: z.string().nullable(),
  conversationNotes: z.unknown(),
  memoryChatBackfillAt: isoDateString.nullable(),
  memoryChatBackfillMsgCount: z.number().int().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const chatMessageRowSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: z.string(),
  content: z.string(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  tokenEstimate: z.number().int().nullable(),
  agentName: z.string().nullable(),
  createdAt: isoDateString,
  /** v1 後方互換: 未設定時は import 側で createdAt と同じにする */
  updatedAt: isoDateString.optional(),
});

const aiArtifactRowSchema = z.object({
  id: z.string(),
  entryId: z.string().nullable(),
  kind: z.enum([
    "CHAT_MESSAGE",
    "JOURNAL_DRAFT",
    "TITLE_SUGGESTION",
    "TAG_SUGGESTION",
    "DAILY_SUMMARY",
    "IMPACT_ESTIMATE",
    "EMBEDDING",
    "IMAGE_PROMPT",
    "SETTINGS_PATCH",
  ]),
  promptVersion: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  tokenEstimate: z.number().int().nullable(),
  cacheKey: z.string().nullable(),
  cacheHit: z.boolean(),
  metadata: z.unknown(),
  createdAt: isoDateString,
});

const memoryLongTermRowSchema = z.object({
  id: z.string(),
  sourceEntryId: z.string().nullable(),
  bullets: z.unknown(),
  attributes: z.unknown(),
  impactScore: z.number(),
  createdAt: isoDateString,
});

const memoryShortTermRowSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  bullets: z.unknown(),
  salience: z.number(),
  dedupKey: z.string().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const agentMemoryRowSchema = z.object({
  id: z.string(),
  domain: z.string(),
  memoryKey: z.string(),
  memoryValue: z.string(),
  confidence: z.number(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const usageCounterRowSchema = z.object({
  id: z.string(),
  dateYmd: z.string(),
  chatMessages: z.number().int(),
  imageGenerations: z.number().int(),
  dailySummaries: z.number().int(),
  orchestratorCalls: z.number().int(),
  memorySubAgentCalls: z.number().int(),
  settingsChanges: z.number().int(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const bundleDataSchema = z.object({
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  exportedAt: isoDateString,
  source: sourceUserHintSchema,
  user: exportedUserSchema,
  /** EXPERIMENTAL_E2EE のために除外された日記の件数（ユーザーへの注意喚起用） */
  skippedE2eeEntries: z.number().int().nonnegative(),

  dailyEntries: z.array(dailyEntryRowSchema),
  entryAppendEvents: z.array(entryAppendEventRowSchema),
  images: z.array(imageRowSchema),
  googlePhotoSelections: z.array(googlePhotoSelectionRowSchema),
  tags: z.array(tagRowSchema),
  entryTags: z.array(entryTagRowSchema),
  googleCalendarEventCache: z.array(googleCalendarEventCacheRowSchema),
  googleCalendarSyncState: z.array(googleCalendarSyncStateRowSchema),
  appLocalCalendars: z.array(appLocalCalendarRowSchema),
  appLocalCalendarEvents: z.array(appLocalCalendarEventRowSchema),
  chatThreads: z.array(chatThreadRowSchema),
  chatMessages: z.array(chatMessageRowSchema),
  aiArtifacts: z.array(aiArtifactRowSchema),
  memoryLongTerm: z.array(memoryLongTermRowSchema),
  memoryShortTerm: z.array(memoryShortTermRowSchema),
  agentMemory: z.array(agentMemoryRowSchema),
  usageCounters: z.array(usageCounterRowSchema),
});

export type BundleData = z.infer<typeof bundleDataSchema>;
export type ExportedUser = z.infer<typeof exportedUserSchema>;
export type SourceUserHint = z.infer<typeof sourceUserHintSchema>;

export type BundleSummary = {
  exportedAt: string;
  source: SourceUserHint;
  counts: {
    dailyEntries: number;
    images: number;
    chatMessages: number;
    appLocalCalendars: number;
    googleCalendarEvents: number;
    tags: number;
    memoryLongTerm: number;
    memoryShortTerm: number;
    agentMemory: number;
    usageCounters: number;
    skippedE2eeEntries: number;
  };
  blobs: { count: number; totalBytes: number };
  /** ソースに存在しターゲットにも値があるトップレベル設定キー（衝突候補） */
  settingsKeys: string[];
};

export function summarizeBundleData(data: BundleData, blobsTotalBytes: number): BundleSummary {
  return {
    exportedAt: data.exportedAt,
    source: data.source,
    counts: {
      dailyEntries: data.dailyEntries.length,
      images: data.images.length,
      chatMessages: data.chatMessages.length,
      appLocalCalendars: data.appLocalCalendars.length,
      googleCalendarEvents: data.googleCalendarEventCache.length,
      tags: data.tags.length,
      memoryLongTerm: data.memoryLongTerm.length,
      memoryShortTerm: data.memoryShortTerm.length,
      agentMemory: data.agentMemory.length,
      usageCounters: data.usageCounters.length,
      skippedE2eeEntries: data.skippedE2eeEntries,
    },
    blobs: { count: data.images.length, totalBytes: blobsTotalBytes },
    settingsKeys: Object.keys(data.user.settings),
  };
}
