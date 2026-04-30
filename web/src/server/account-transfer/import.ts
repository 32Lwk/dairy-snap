import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  type BundleData,
  type BundleSummary,
  summarizeBundleData,
} from "@/lib/account-transfer/bundle-schema";
import {
  type DecryptedBundle,
  decryptBundle,
} from "@/server/account-transfer/bundle-codec";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";

export type ImportPlan = {
  targetExistingDailyCount: number;
  bundleDailyCount: number;
  /** 実際に新規作成される日記（日付がターゲットに未登録のもの） */
  importableDailyCount: number;
  /** 同一日付が既にあるためスキップされるバンドル内の日記 */
  skippedDailyDueToDateOverlap: number;
  /**
   * true のとき、バンドル内のアプリ／Google カレンダー・使用量・エージェント記憶は取り込まない。
   * （日付重複がある部分インポート時。ユーザー環境のスナップショットと矛盾しないようにする）
   */
  dropsBundledGlobalSnapshot: boolean;
  /** 検証画面でインポート実行が可能か */
  canImport: boolean;
};

/** フィルタ後に実際に DB へ入る件数のプレビュー（dry run / UI 用） */
export type ImportPreviewCounts = {
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

export type DryRunResult = {
  ok: true;
  summary: BundleSummary;
  /** ターゲットに既に DailyEntry が1件でもあれば true */
  targetHasEntries: boolean;
  targetSettingsKeys: string[];
  /** ソースとターゲット両方に存在するトップレベル設定キー（ユーザーに選ばせる対象） */
  conflictingSettingsKeys: string[];
  importPlan: ImportPlan;
  importPreviewCounts: ImportPreviewCounts;
  importPreviewBlobs: { count: number; totalBytes: number };
};

function buildImportPlan(
  bundleDailyCount: number,
  targetExistingDailyCount: number,
  existingDates: Set<string>,
  data: BundleData,
): ImportPlan {
  const importableDailyCount = data.dailyEntries.filter(
    (e) => !existingDates.has(e.entryDateYmd),
  ).length;
  const skippedDailyDueToDateOverlap = bundleDailyCount - importableDailyCount;
  const hasDateOverlap = skippedDailyDueToDateOverlap > 0;
  const dropsBundledGlobalSnapshot =
    targetExistingDailyCount > 0 && hasDateOverlap;
  const canImport =
    importableDailyCount > 0 ||
    (targetExistingDailyCount === 0 && bundleDailyCount > 0) ||
    (targetExistingDailyCount > 0 && !hasDateOverlap && bundleDailyCount > 0);

  return {
    targetExistingDailyCount,
    bundleDailyCount,
    importableDailyCount,
    skippedDailyDueToDateOverlap,
    dropsBundledGlobalSnapshot,
    canImport,
  };
}

/**
 * 日付がターゲットと重なる日記だけを落とし、グローバルスナップショット系は空にする。
 */
function filterBundleForDateOverlapImport(
  data: BundleData,
  existingDates: Set<string>,
): BundleData {
  const allowedEntryIds = new Set(
    data.dailyEntries.filter((e) => !existingDates.has(e.entryDateYmd)).map((e) => e.id),
  );

  const dailyEntries = data.dailyEntries.filter((e) => allowedEntryIds.has(e.id));
  const entryAppendEvents = data.entryAppendEvents.filter((r) =>
    allowedEntryIds.has(r.entryId),
  );
  const images = data.images.filter((r) => allowedEntryIds.has(r.entryId));
  const googlePhotoSelections = data.googlePhotoSelections.filter(
    (r) =>
      (r.entryId != null && allowedEntryIds.has(r.entryId)) ||
      (r.entryId == null && !existingDates.has(r.entryDateYmd)),
  );
  const entryTags = data.entryTags.filter((r) => allowedEntryIds.has(r.entryId));
  const tagIdsNeeded = new Set(entryTags.map((r) => r.tagId));
  const tags = data.tags.filter((t) => tagIdsNeeded.has(t.id));

  const chatThreads = data.chatThreads.filter((r) => allowedEntryIds.has(r.entryId));
  const threadIds = new Set(chatThreads.map((t) => t.id));
  const chatMessages = data.chatMessages.filter((m) => threadIds.has(m.threadId));

  const aiArtifacts = data.aiArtifacts.filter(
    (r) => !r.entryId || allowedEntryIds.has(r.entryId),
  );

  const memoryShortTerm = data.memoryShortTerm.filter((r) =>
    allowedEntryIds.has(r.entryId),
  );
  const memoryLongTerm = data.memoryLongTerm.filter(
    (r) => r.sourceEntryId != null && allowedEntryIds.has(r.sourceEntryId),
  );

  return {
    ...data,
    dailyEntries,
    entryAppendEvents,
    images,
    googlePhotoSelections,
    tags,
    entryTags,
    googleCalendarEventCache: [],
    googleCalendarSyncState: [],
    appLocalCalendars: [],
    appLocalCalendarEvents: [],
    chatThreads,
    chatMessages,
    aiArtifacts,
    memoryLongTerm,
    memoryShortTerm,
    agentMemory: [],
    usageCounters: [],
  };
}

function prepareDataForApply(
  data: BundleData,
  existingDates: Set<string>,
  targetExistingDailyCount: number,
): BundleData {
  if (targetExistingDailyCount === 0) {
    return data;
  }
  const hasDateOverlap = data.dailyEntries.some((e) =>
    existingDates.has(e.entryDateYmd),
  );
  if (!hasDateOverlap) {
    return data;
  }
  return filterBundleForDateOverlapImport(data, existingDates);
}

/** バンドルを復号→件数サマリ＋ターゲットの状態を返す（DB 書き込みなし） */
export async function dryRunImport(
  bundleJwe: string,
  passphrase: string,
  targetUserId: string,
): Promise<DryRunResult> {
  const decrypted = await decryptBundle(bundleJwe, passphrase);
  const blobsTotalBytes = Array.from(decrypted.blobs.values()).reduce(
    (s, b) => s + b.bytes.byteLength,
    0,
  );
  const summary = summarizeBundleData(decrypted.data, blobsTotalBytes);

  const target = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: { settings: true },
  });
  const targetSettingsObj =
    target.settings && typeof target.settings === "object" && !Array.isArray(target.settings)
      ? (target.settings as Record<string, unknown>)
      : {};
  const targetSettingsKeys = Object.keys(targetSettingsObj);
  const conflicting = summary.settingsKeys.filter((k) => targetSettingsKeys.includes(k));

  const existingRows = await prisma.dailyEntry.findMany({
    where: { userId: targetUserId },
    select: { entryDateYmd: true },
  });
  const existingDates = new Set(existingRows.map((r) => r.entryDateYmd));
  const targetExistingDailyCount = existingRows.length;
  const bundleDailyCount = decrypted.data.dailyEntries.length;

  const importPlan = buildImportPlan(
    bundleDailyCount,
    targetExistingDailyCount,
    existingDates,
    decrypted.data,
  );

  const preparedPreview = prepareDataForApply(
    decrypted.data,
    existingDates,
    targetExistingDailyCount,
  );
  const importPreviewCounts: ImportPreviewCounts = {
    dailyEntries: preparedPreview.dailyEntries.length,
    images: preparedPreview.images.length,
    chatMessages: preparedPreview.chatMessages.length,
    appLocalCalendars: preparedPreview.appLocalCalendars.length,
    googleCalendarEvents: preparedPreview.googleCalendarEventCache.length,
    tags: preparedPreview.tags.length,
    memoryLongTerm: preparedPreview.memoryLongTerm.length,
    memoryShortTerm: preparedPreview.memoryShortTerm.length,
    agentMemory: preparedPreview.agentMemory.length,
    usageCounters: preparedPreview.usageCounters.length,
    skippedE2eeEntries: decrypted.data.skippedE2eeEntries,
  };

  let importPreviewBlobsTotalBytes = 0;
  for (const img of preparedPreview.images) {
    const blob = decrypted.blobs.get(img.storageKey);
    if (blob) importPreviewBlobsTotalBytes += blob.bytes.byteLength;
  }

  return {
    ok: true,
    summary,
    targetHasEntries: targetExistingDailyCount > 0,
    targetSettingsKeys,
    conflictingSettingsKeys: conflicting,
    importPlan,
    importPreviewCounts,
    importPreviewBlobs: {
      count: preparedPreview.images.length,
      totalBytes: importPreviewBlobsTotalBytes,
    },
  };
}

export type ImportConflictError = {
  kind: "target_has_entries" | "all_entries_date_overlap";
  message: string;
};

export type ImportApplyResult =
  | { ok: true; summary: BundleSummary }
  | { ok: false; error: ImportConflictError };

/**
 * インポートを実行。
 * - settingsSourceKeys: バンドル(ソース)から採用するトップレベル設定キー一覧。
 *   それ以外はターゲットの値を維持する。
 *
 * 既に日記があるアカウントでも、バンドル内の日付がすべて埋まっているわけでなければ取り込み可能。
 * 日付が重なる日はスキップし、カレンダーキャッシュ等のスナップショットは部分取り込み時は載せない。
 */
export async function applyImport(
  bundleJwe: string,
  passphrase: string,
  targetUserId: string,
  settingsSourceKeys: string[],
): Promise<ImportApplyResult> {
  const decrypted = await decryptBundle(bundleJwe, passphrase);
  const data = decrypted.data;

  const existingRows = await prisma.dailyEntry.findMany({
    where: { userId: targetUserId },
    select: { entryDateYmd: true },
  });
  const existingDates = new Set(existingRows.map((r) => r.entryDateYmd));
  const targetExistingDailyCount = existingRows.length;

  const prepared = prepareDataForApply(data, existingDates, targetExistingDailyCount);

  if (data.dailyEntries.length > 0 && prepared.dailyEntries.length === 0) {
    return {
      ok: false,
      error: {
        kind: "all_entries_date_overlap",
        message:
          "バンドル内の日記の日付が、すべてこのアカウントの既存日記と重なっています。重複しない日付のデータがあるバンドルを使うか、別アカウントでお試しください。",
      },
    };
  }

  const blobsTotalBytes = Array.from(decrypted.blobs.values()).reduce(
    (s, b) => s + b.bytes.byteLength,
    0,
  );
  const summary = summarizeBundleData(prepared, blobsTotalBytes);

  const idMap = buildIdMap(prepared);

  const existingTags = await prisma.tag.findMany({
    where: { userId: targetUserId },
    select: { id: true, name: true },
  });
  const tagNameToId = new Map(existingTags.map((t) => [t.name, t.id]));
  for (const t of prepared.tags) {
    const hit = tagNameToId.get(t.name);
    if (hit) idMap.tags.set(t.id, hit);
  }
  const tagsToCreate = prepared.tags.filter((t) => !tagNameToId.has(t.name));

  const stagedKeys = await stageBlobs(decrypted, idMap, targetUserId, prepared.images);

  const skipDuplicateGlobals = targetExistingDailyCount > 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        await applyUserSettings(tx, targetUserId, prepared, settingsSourceKeys);
        await insertAllRows(tx, targetUserId, prepared, idMap, tagsToCreate, {
          skipDuplicateGlobals,
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    await Promise.allSettled(
      stagedKeys.map((k) => getObjectStorage().delete(k)),
    );
    throw e;
  }

  return { ok: true, summary };
}

/** ID 再マップ表（ソース ID → ターゲット ID） */
type IdMap = {
  dailyEntries: Map<string, string>;
  appendEvents: Map<string, string>;
  images: Map<string, string>;
  photoSelections: Map<string, string>;
  tags: Map<string, string>;
  gcalCache: Map<string, string>;
  gcalSync: Map<string, string>;
  appCalendars: Map<string, string>;
  appCalEvents: Map<string, string>;
  chatThreads: Map<string, string>;
  chatMessages: Map<string, string>;
  aiArtifacts: Map<string, string>;
  longTerm: Map<string, string>;
  shortTerm: Map<string, string>;
  agentMemory: Map<string, string>;
  usageCounters: Map<string, string>;
};

function buildIdMap(data: BundleData): IdMap {
  const fillIds = <T extends { id: string }>(rows: T[]): Map<string, string> => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.id, randomUUID());
    return m;
  };
  return {
    dailyEntries: fillIds(data.dailyEntries),
    appendEvents: fillIds(data.entryAppendEvents),
    images: fillIds(data.images),
    photoSelections: fillIds(data.googlePhotoSelections),
    tags: fillIds(data.tags),
    gcalCache: fillIds(data.googleCalendarEventCache),
    gcalSync: fillIds(data.googleCalendarSyncState),
    appCalendars: fillIds(data.appLocalCalendars),
    appCalEvents: fillIds(data.appLocalCalendarEvents),
    chatThreads: fillIds(data.chatThreads),
    chatMessages: fillIds(data.chatMessages),
    aiArtifacts: fillIds(data.aiArtifacts),
    longTerm: fillIds(data.memoryLongTerm),
    shortTerm: fillIds(data.memoryShortTerm),
    agentMemory: fillIds(data.agentMemory),
    usageCounters: fillIds(data.usageCounters),
  };
}

function newStorageKeyFor(targetUserId: string, newImageId: string): string {
  return `users/${targetUserId}/imported/${newImageId}`;
}

async function stageBlobs(
  decrypted: DecryptedBundle,
  idMap: IdMap,
  targetUserId: string,
  images: BundleData["images"],
): Promise<string[]> {
  const storage = getObjectStorage();
  const stagedKeys: string[] = [];
  for (const img of images) {
    const newImageId = idMap.images.get(img.id);
    if (!newImageId) continue;
    const blob = decrypted.blobs.get(img.storageKey);
    if (!blob) continue;
    if (blob.bytes.byteLength === 0) continue;
    const newKey = newStorageKeyFor(targetUserId, newImageId);
    await storage.put({
      key: newKey,
      body: Buffer.from(blob.bytes),
      contentType: img.mimeType,
    });
    stagedKeys.push(newKey);
  }
  return stagedKeys;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * トップレベルキー単位の衝突解決:
 * - settingsSourceKeys に含まれるキー → ソース値で上書き
 * - 含まれないキー → ターゲットを維持（ソースのキーは無視）
 */
async function applyUserSettings(
  tx: Tx,
  targetUserId: string,
  data: BundleData,
  settingsSourceKeys: string[],
) {
  const target = await tx.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: { settings: true },
  });
  const base =
    target.settings && typeof target.settings === "object" && !Array.isArray(target.settings)
      ? { ...(target.settings as Record<string, unknown>) }
      : {};
  const source = data.user.settings;
  const sourceKeys = new Set(Object.keys(source));
  const sourceWinSet = new Set(settingsSourceKeys.filter((k) => sourceKeys.has(k)));
  const targetKeys = new Set(Object.keys(base));

  for (const k of sourceKeys) {
    if (sourceWinSet.has(k)) {
      base[k] = source[k];
    } else if (!targetKeys.has(k)) {
      // ターゲットに無い未知キーはソース値で補完（ユーザー意図に近い）
      base[k] = source[k];
    }
  }

  await tx.user.update({
    where: { id: targetUserId },
    data: {
      timeZone: data.user.timeZone,
      // isAllowed はターゲットの現在値を維持（バイパス防止）
      settings: base as Prisma.InputJsonValue,
    },
  });
}

type InsertOptions = { skipDuplicateGlobals: boolean };

async function insertAllRows(
  tx: Tx,
  targetUserId: string,
  data: BundleData,
  idMap: IdMap,
  tagsToCreate: BundleData["tags"],
  opts: InsertOptions,
) {
  if (tagsToCreate.length > 0) {
    await tx.tag.createMany({
      data: tagsToCreate.map((r) => ({
        id: idMap.tags.get(r.id)!,
        userId: targetUserId,
        name: r.name,
        createdAt: new Date(r.createdAt),
      })),
    });
  }

  if (data.appLocalCalendars.length > 0) {
    await tx.appLocalCalendar.createMany({
      data: data.appLocalCalendars.map((r) => ({
        id: idMap.appCalendars.get(r.id)!,
        userId: targetUserId,
        name: r.name,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
    });
  }

  if (data.dailyEntries.length > 0) {
    await tx.dailyEntry.createMany({
      data: data.dailyEntries.map((r) => ({
        id: idMap.dailyEntries.get(r.id)!,
        userId: targetUserId,
        entryDateYmd: r.entryDateYmd,
        title: r.title,
        mood: r.mood,
        body: r.body,
        latitude: r.latitude,
        longitude: r.longitude,
        weatherPeriod: r.weatherPeriod ?? null,
        weatherJson: (r.weatherJson ?? null) as Prisma.InputJsonValue,
        encryptionMode: "STANDARD" as const,
        encryptionMeta: (r.encryptionMeta ?? {}) as Prisma.InputJsonValue,
        plutchikAnalysis: (r.plutchikAnalysis ?? null) as Prisma.InputJsonValue,
        dominantEmotion: r.dominantEmotion,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
    });
  }

  if (data.entryAppendEvents.length > 0) {
    await tx.entryAppendEvent.createMany({
      data: data.entryAppendEvents.map((r) => ({
        id: idMap.appendEvents.get(r.id)!,
        entryId: idMap.dailyEntries.get(r.entryId)!,
        occurredAt: new Date(r.occurredAt),
        fragment: r.fragment,
        createdAt: new Date(r.createdAt),
      })),
    });
  }

  if (data.images.length > 0) {
    await tx.image.createMany({
      data: data.images.map((r) => {
        const newImageId = idMap.images.get(r.id)!;
        return {
          id: newImageId,
          entryId: idMap.dailyEntries.get(r.entryId)!,
          kind: r.kind,
          storageKey: newStorageKeyFor(targetUserId, newImageId),
          mimeType: r.mimeType,
          byteSize: r.byteSize,
          sha256: r.sha256,
          googleMediaItemId: r.googleMediaItemId,
          rotationQuarterTurns: r.rotationQuarterTurns,
          caption: r.caption,
          width: r.width,
          height: r.height,
          createdAt: new Date(r.createdAt),
        };
      }),
    });
  }

  if (data.googlePhotoSelections.length > 0) {
    await tx.googlePhotoSelection.createMany({
      data: data.googlePhotoSelections.map((r) => ({
        id: idMap.photoSelections.get(r.id)!,
        userId: targetUserId,
        entryId: r.entryId ? (idMap.dailyEntries.get(r.entryId) ?? null) : null,
        entryDateYmd: r.entryDateYmd,
        providerSessionId: r.providerSessionId,
        mediaItemId: r.mediaItemId,
        baseUrl: r.baseUrl,
        productUrl: r.productUrl,
        mimeType: r.mimeType,
        filename: r.filename,
        width: r.width,
        height: r.height,
        creationTime: r.creationTime ? new Date(r.creationTime) : null,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
      skipDuplicates: opts.skipDuplicateGlobals,
    });
  }

  if (data.entryTags.length > 0) {
    await tx.entryTag.createMany({
      data: data.entryTags
        .map((r) => {
          const e = idMap.dailyEntries.get(r.entryId);
          const t = idMap.tags.get(r.tagId);
          if (!e || !t) return null;
          return { entryId: e, tagId: t };
        })
        .filter((x): x is { entryId: string; tagId: string } => x !== null),
    });
  }

  if (data.googleCalendarEventCache.length > 0) {
    await tx.googleCalendarEventCache.createMany({
      data: data.googleCalendarEventCache.map((r) => ({
        id: idMap.gcalCache.get(r.id)!,
        userId: targetUserId,
        calendarId: r.calendarId,
        eventId: r.eventId,
        calendarName: r.calendarName,
        calendarColorId: r.calendarColorId,
        eventColorId: r.eventColorId,
        title: r.title,
        location: r.location,
        description: r.description,
        eventPayload: (r.eventPayload ?? null) as Prisma.InputJsonValue,
        eventSearchBlob: r.eventSearchBlob,
        startIso: r.startIso,
        endIso: r.endIso,
        startAt: new Date(r.startAt),
        endAt: new Date(r.endAt),
        fixedCategory: r.fixedCategory,
        isCancelled: r.isCancelled,
        updatedAtGcal: r.updatedAtGcal ? new Date(r.updatedAtGcal) : null,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
      skipDuplicates: opts.skipDuplicateGlobals,
    });
  }

  if (data.googleCalendarSyncState.length > 0) {
    await tx.googleCalendarSyncState.createMany({
      data: data.googleCalendarSyncState.map((r) => ({
        id: idMap.gcalSync.get(r.id)!,
        userId: targetUserId,
        calendarId: r.calendarId,
        lastSyncAt: r.lastSyncAt ? new Date(r.lastSyncAt) : null,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
      skipDuplicates: opts.skipDuplicateGlobals,
    });
  }

  if (data.appLocalCalendarEvents.length > 0) {
    await tx.appLocalCalendarEvent.createMany({
      data: data.appLocalCalendarEvents
        .map((r) => {
          const cal = idMap.appCalendars.get(r.calendarId);
          if (!cal) return null;
          return {
            id: idMap.appCalEvents.get(r.id)!,
            userId: targetUserId,
            calendarId: cal,
            title: r.title,
            description: r.description,
            location: r.location,
            startIso: r.startIso,
            endIso: r.endIso,
            startAt: new Date(r.startAt),
            endAt: new Date(r.endAt),
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    });
  }

  if (data.chatThreads.length > 0) {
    await tx.chatThread.createMany({
      data: data.chatThreads
        .map((r) => {
          const e = idMap.dailyEntries.get(r.entryId);
          if (!e) return null;
          return {
            id: idMap.chatThreads.get(r.id)!,
            entryId: e,
            title: r.title,
            conversationNotes: (r.conversationNotes ?? {}) as Prisma.InputJsonValue,
            memoryChatBackfillAt: r.memoryChatBackfillAt
              ? new Date(r.memoryChatBackfillAt)
              : null,
            memoryChatBackfillMsgCount: r.memoryChatBackfillMsgCount,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    });
  }

  if (data.chatMessages.length > 0) {
    await tx.chatMessage.createMany({
      data: data.chatMessages
        .map((r) => {
          const t = idMap.chatThreads.get(r.threadId);
          if (!t) return null;
          return {
            id: idMap.chatMessages.get(r.id)!,
            threadId: t,
            role: r.role,
            content: r.content,
            model: r.model,
            latencyMs: r.latencyMs,
            tokenEstimate: r.tokenEstimate,
            agentName: r.agentName,
            createdAt: new Date(r.createdAt),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    });
  }

  if (data.aiArtifacts.length > 0) {
    await tx.aIArtifact.createMany({
      data: data.aiArtifacts.map((r) => ({
        id: idMap.aiArtifacts.get(r.id)!,
        userId: targetUserId,
        entryId: r.entryId ? (idMap.dailyEntries.get(r.entryId) ?? null) : null,
        kind: r.kind,
        promptVersion: r.promptVersion,
        model: r.model,
        latencyMs: r.latencyMs,
        tokenEstimate: r.tokenEstimate,
        cacheKey: r.cacheKey,
        cacheHit: r.cacheHit,
        metadata: (r.metadata ?? {}) as Prisma.InputJsonValue,
        createdAt: new Date(r.createdAt),
      })),
    });
  }

  if (data.memoryLongTerm.length > 0) {
    await tx.memoryLongTerm.createMany({
      data: data.memoryLongTerm.map((r) => ({
        id: idMap.longTerm.get(r.id)!,
        userId: targetUserId,
        sourceEntryId: r.sourceEntryId
          ? (idMap.dailyEntries.get(r.sourceEntryId) ?? null)
          : null,
        bullets: (r.bullets ?? []) as Prisma.InputJsonValue,
        attributes: (r.attributes ?? {}) as Prisma.InputJsonValue,
        impactScore: r.impactScore,
        createdAt: new Date(r.createdAt),
      })),
    });
  }

  if (data.memoryShortTerm.length > 0) {
    await tx.memoryShortTerm.createMany({
      data: data.memoryShortTerm
        .map((r) => {
          const e = idMap.dailyEntries.get(r.entryId);
          if (!e) return null;
          return {
            id: idMap.shortTerm.get(r.id)!,
            userId: targetUserId,
            entryId: e,
            bullets: (r.bullets ?? []) as Prisma.InputJsonValue,
            salience: r.salience,
            dedupKey: r.dedupKey,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    });
  }

  if (data.agentMemory.length > 0) {
    await tx.agentMemory.createMany({
      data: data.agentMemory.map((r) => ({
        id: idMap.agentMemory.get(r.id)!,
        userId: targetUserId,
        domain: r.domain,
        memoryKey: r.memoryKey,
        memoryValue: r.memoryValue,
        confidence: r.confidence,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
      skipDuplicates: opts.skipDuplicateGlobals,
    });
  }

  if (data.usageCounters.length > 0) {
    await tx.usageCounter.createMany({
      data: data.usageCounters.map((r) => ({
        id: idMap.usageCounters.get(r.id)!,
        userId: targetUserId,
        dateYmd: r.dateYmd,
        chatMessages: r.chatMessages,
        imageGenerations: r.imageGenerations,
        dailySummaries: r.dailySummaries,
        orchestratorCalls: r.orchestratorCalls,
        memorySubAgentCalls: r.memorySubAgentCalls,
        settingsChanges: r.settingsChanges,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })),
      skipDuplicates: opts.skipDuplicateGlobals,
    });
  }
}

/**
 * インポート完了後に、ターゲットユーザーの本文 embedding を再生成する
 * バックグラウンドジョブを起動する（fire-and-forget）。
 */
export function scheduleEmbeddingRebuild(targetUserId: string) {
  // 動的 import で循環依存を避ける（embeddings.ts は OpenAI を初期化する）
  void (async () => {
    try {
      const { upsertEntryEmbedding } = await import("@/server/embeddings");
      const entries = await prisma.dailyEntry.findMany({
        where: { userId: targetUserId, encryptionMode: "STANDARD" },
        select: { id: true, body: true },
      });
      for (const e of entries) {
        try {
          await upsertEntryEmbedding(targetUserId, e.id, e.body ?? "");
        } catch (err) {
          console.error(
            `[account-transfer] embedding upsert failed entryId=${e.id}:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error("[account-transfer] embedding rebuild failed:", err);
    }
  })();
}

export type { BundleData };
