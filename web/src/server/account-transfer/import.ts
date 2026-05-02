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

export type OverlapChoice = "skip" | "replace" | "merge";

export type OverlapDateDetail = {
  entryDateYmd: string;
  bundle: {
    title: string | null;
    /** モーダル用（改行をある程度保持） */
    bodyPreview: string;
    imageCount: number;
    imageUploadedCount: number;
    imageGeneratedCount: number;
    chatThreadCount: number;
  };
  target: {
    title: string | null;
    bodyPreview: string;
    imageCount: number;
    chatThreadCount: number;
  };
};

export type ConflictingSettingRow = {
  key: string;
  bundleText: string;
  targetText: string;
};

export type ImportPreviewDetail = {
  entryDatesYmd: string[];
  imageByKind: { uploaded: number; generated: number };
  tagNames: string[];
  appLocalCalendarNames: string[];
  chatThreadSummaries: string[];
  googleCalendarSampleTitles: string[];
  memoryLongTermCount: number;
  memoryShortTermEntryDates: string[];
  agentMemoryLines: string[];
  usageCounterDatesYmd: string[];
};

export type DryRunResult = {
  ok: true;
  summary: BundleSummary;
  /** ターゲットに既に DailyEntry が1件でもあれば true */
  targetHasEntries: boolean;
  targetSettingsKeys: string[];
  /** ソースとターゲット両方に存在するトップレベル設定キー（ユーザーに選ばせる対象） */
  conflictingSettingsKeys: string[];
  /** 衝突キーごとの JSON プレビュー（UI 比較用） */
  conflictingSettingsDetail: ConflictingSettingRow[];
  importPlan: ImportPlan;
  importPreviewCounts: ImportPreviewCounts;
  importPreviewBlobs: { count: number; totalBytes: number };
  importPreviewDetail: ImportPreviewDetail;
  /** 日付が重なる日の比較用（新規日は含まない） */
  overlapDateRows: OverlapDateDetail[];
  /** バンドルにあってターゲットにまだ無い日付（昇順） */
  newImportDates: string[];
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

const MERGE_BODY_SEPARATOR = "\n\n────────\n▽ バンドルから結合した本文\n\n";

function previewBodyForUi(s: string, max = 900): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function parseOverlapChoices(raw: unknown): Record<string, OverlapChoice> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
  const out: Record<string, OverlapChoice> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ymdRe.test(k)) continue;
    if (v === "skip" || v === "replace" || v === "merge") out[k] = v;
  }
  return out;
}

/**
 * ソース日記 ID 集合に基づきバンドルを部分集合化（グローバル行はそのまま）。
 */
function filterBundleDataByEntryIds(
  data: BundleData,
  allowedEntryIds: Set<string>,
): BundleData {
  const dailyEntries = data.dailyEntries.filter((e) => allowedEntryIds.has(e.id));
  const ymds = new Set(dailyEntries.map((e) => e.entryDateYmd));

  const entryAppendEvents = data.entryAppendEvents.filter((r) =>
    allowedEntryIds.has(r.entryId),
  );
  const images = data.images.filter((r) => allowedEntryIds.has(r.entryId));
  const googlePhotoSelections = data.googlePhotoSelections.filter(
    (r) =>
      (r.entryId != null && allowedEntryIds.has(r.entryId)) ||
      (r.entryId == null && ymds.has(r.entryDateYmd)),
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
    chatThreads,
    chatMessages,
    aiArtifacts,
    memoryLongTerm,
    memoryShortTerm,
  };
}

function stripBundledGlobalSnapshotRows(data: BundleData): BundleData {
  return {
    ...data,
    googleCalendarEventCache: [],
    googleCalendarSyncState: [],
    appLocalCalendars: [],
    appLocalCalendarEvents: [],
    agentMemory: [],
    usageCounters: [],
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
  return stripBundledGlobalSnapshotRows(filterBundleDataByEntryIds(data, allowedEntryIds));
}

type MergeJob = {
  targetEntryId: string;
  bundleEntry: BundleData["dailyEntries"][number];
  images: BundleData["images"];
  appendEvents: BundleData["entryAppendEvents"];
  entryTags: BundleData["entryTags"];
  googlePhotoSelections: BundleData["googlePhotoSelections"];
  memoryShortTerm: BundleData["memoryShortTerm"];
};

async function buildOverlapDateRows(
  data: BundleData,
  targetUserId: string,
): Promise<{ overlapDateRows: OverlapDateDetail[]; newImportDates: string[] }> {
  const bundleByYmd = new Map(data.dailyEntries.map((e) => [e.entryDateYmd, e]));
  const bundleYmds = [...bundleByYmd.keys()];

  const targets = await prisma.dailyEntry.findMany({
    where: { userId: targetUserId, entryDateYmd: { in: bundleYmds } },
    select: {
      entryDateYmd: true,
      title: true,
      body: true,
      _count: { select: { images: true, chatThreads: true } },
    },
  });
  const targetByYmd = new Map(targets.map((t) => [t.entryDateYmd, t]));

  const overlapDateRows: OverlapDateDetail[] = [];
  const newImportDates: string[] = [];

  for (const ymd of bundleYmds.sort()) {
    const bundleEntry = bundleByYmd.get(ymd)!;
    const t = targetByYmd.get(ymd);
    if (!t) {
      newImportDates.push(ymd);
      continue;
    }
    const bi = data.images.filter((i) => i.entryId === bundleEntry.id);
    const bthreads = data.chatThreads.filter((c) => c.entryId === bundleEntry.id);
    overlapDateRows.push({
      entryDateYmd: ymd,
      bundle: {
        title: bundleEntry.title,
        bodyPreview: previewBodyForUi(bundleEntry.body ?? ""),
        imageCount: bi.length,
        imageUploadedCount: bi.filter((i) => i.kind === "UPLOADED").length,
        imageGeneratedCount: bi.filter((i) => i.kind === "GENERATED").length,
        chatThreadCount: bthreads.length,
      },
      target: {
        title: t.title,
        bodyPreview: previewBodyForUi(t.body ?? ""),
        imageCount: t._count.images,
        chatThreadCount: t._count.chatThreads,
      },
    });
  }

  return { overlapDateRows, newImportDates };
}

function buildImportPayload(
  data: BundleData,
  choices: Record<string, OverlapChoice>,
  occupiedAfterReplace: Set<string>,
  targetByYmd: Map<string, { id: string }>,
): { prepared: BundleData; mergeJobs: MergeJob[] } {
  const mergeJobs: MergeJob[] = [];
  const includedEntryIds = new Set<string>();

  for (const e of data.dailyEntries) {
    const ymd = e.entryDateYmd;
    if (!occupiedAfterReplace.has(ymd)) {
      includedEntryIds.add(e.id);
      continue;
    }
    const ch = choices[ymd] ?? "skip";
    if (ch === "merge") {
      const target = targetByYmd.get(ymd);
      if (target) {
        mergeJobs.push({
          targetEntryId: target.id,
          bundleEntry: e,
          images: data.images.filter((i) => i.entryId === e.id),
          appendEvents: data.entryAppendEvents.filter((a) => a.entryId === e.id),
          entryTags: data.entryTags.filter((t) => t.entryId === e.id),
          googlePhotoSelections: data.googlePhotoSelections.filter(
            (p) =>
              (p.entryId != null && p.entryId === e.id) ||
              (p.entryId == null && p.entryDateYmd === ymd),
          ),
          memoryShortTerm: data.memoryShortTerm.filter((m) => m.entryId === e.id),
        });
      }
    }
  }

  let prepared = filterBundleDataByEntryIds(data, includedEntryIds);
  return { prepared, mergeJobs };
}

function shouldStripGlobalsForImport(
  initialTargetHadEntries: boolean,
  choices: Record<string, OverlapChoice>,
  data: BundleData,
  initialExistingDates: Set<string>,
): boolean {
  if (!initialTargetHadEntries) return false;
  for (const e of data.dailyEntries) {
    if (!initialExistingDates.has(e.entryDateYmd)) continue;
    const ch = choices[e.entryDateYmd] ?? "skip";
    if (ch === "skip" || ch === "merge") return true;
  }
  return false;
}

function allocateIdsForMergeJobs(jobs: MergeJob[], idMap: IdMap) {
  for (const job of jobs) {
    for (const r of job.appendEvents) {
      if (!idMap.appendEvents.has(r.id)) idMap.appendEvents.set(r.id, randomUUID());
    }
    for (const img of job.images) {
      if (!idMap.images.has(img.id)) idMap.images.set(img.id, randomUUID());
    }
    for (const p of job.googlePhotoSelections) {
      if (!idMap.photoSelections.has(p.id)) idMap.photoSelections.set(p.id, randomUUID());
    }
    for (const m of job.memoryShortTerm) {
      if (!idMap.shortTerm.has(m.id)) idMap.shortTerm.set(m.id, randomUUID());
    }
  }
}

function dedupeTags(list: BundleData["tags"]): BundleData["tags"] {
  const seen = new Set<string>();
  return list.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function collectTagsForPreparedAndMerges(
  prepared: BundleData,
  mergeJobs: MergeJob[],
  allBundleTags: BundleData["tags"],
): BundleData["tags"] {
  const tagIds = new Set<string>();
  for (const t of prepared.entryTags) tagIds.add(t.tagId);
  for (const j of mergeJobs) for (const t of j.entryTags) tagIds.add(t.tagId);
  return dedupeTags(allBundleTags.filter((t) => tagIds.has(t.id)));
}

async function applyMergeJobsInTx(
  tx: Tx,
  targetUserId: string,
  jobs: MergeJob[],
  idMap: IdMap,
  opts: InsertOptions,
) {
  for (const job of jobs) {
    const cur = await tx.dailyEntry.findUniqueOrThrow({
      where: { id: job.targetEntryId },
      select: { body: true, title: true },
    });
    const bundleBody = job.bundleEntry.body ?? "";
    const newBody = (cur.body ?? "") + MERGE_BODY_SEPARATOR + bundleBody;
    const newTitle = cur.title?.trim() ? cur.title : job.bundleEntry.title;

    await tx.dailyEntry.update({
      where: { id: job.targetEntryId },
      data: {
        body: newBody,
        title: newTitle,
      },
    });

    if (job.appendEvents.length > 0) {
      await tx.entryAppendEvent.createMany({
        data: job.appendEvents.map((r) => ({
          id: idMap.appendEvents.get(r.id)!,
          entryId: job.targetEntryId,
          occurredAt: new Date(r.occurredAt),
          fragment: r.fragment,
          createdAt: new Date(r.createdAt),
        })),
      });
    }

    if (job.images.length > 0) {
      await tx.image.createMany({
        data: job.images.map((r) => {
          const newImageId = idMap.images.get(r.id)!;
          return {
            id: newImageId,
            entryId: job.targetEntryId,
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

    if (job.googlePhotoSelections.length > 0) {
      await tx.googlePhotoSelection.createMany({
        data: job.googlePhotoSelections.map((r) => ({
          id: idMap.photoSelections.get(r.id)!,
          userId: targetUserId,
          entryId: job.targetEntryId,
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

    if (job.entryTags.length > 0) {
      await tx.entryTag.createMany({
        data: job.entryTags
          .map((r) => {
            const tid = idMap.tags.get(r.tagId);
            if (!tid) return null;
            return { entryId: job.targetEntryId, tagId: tid };
          })
          .filter((x): x is { entryId: string; tagId: string } => x !== null),
        skipDuplicates: true,
      });
    }

    if (job.memoryShortTerm.length > 0) {
      await tx.memoryShortTerm.createMany({
        data: job.memoryShortTerm.map((r) => ({
          id: idMap.shortTerm.get(r.id)!,
          userId: targetUserId,
          entryId: job.targetEntryId,
          bullets: (r.bullets ?? []) as Prisma.InputJsonValue,
          salience: r.salience,
          dedupKey: r.dedupKey,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        })),
      });
    }
  }
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

function serializeSettingJson(v: unknown, maxLen: number): string {
  if (v === undefined) return "（このキーはバンドルにありません）";
  try {
    const s = JSON.stringify(v, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n… （長いため省略）`;
  } catch {
    const t = String(v);
    return t.length <= maxLen ? t : `${t.slice(0, maxLen)}\n… （省略）`;
  }
}

function buildConflictingSettingsDetail(
  keys: string[],
  bundleSettings: Record<string, unknown>,
  targetSettings: Record<string, unknown>,
): ConflictingSettingRow[] {
  return keys.map((key) => ({
    key,
    bundleText: serializeSettingJson(bundleSettings[key], 12_000),
    targetText: serializeSettingJson(targetSettings[key], 12_000),
  }));
}

function buildImportPreviewDetail(prepared: BundleData): ImportPreviewDetail {
  const entryYmdById = new Map(
    prepared.dailyEntries.map((e) => [e.id, e.entryDateYmd] as const),
  );
  const entryDatesYmd = [...new Set(prepared.dailyEntries.map((e) => e.entryDateYmd))].sort();

  const images = prepared.images;
  const imageByKind = {
    uploaded: images.filter((i) => i.kind === "UPLOADED").length,
    generated: images.filter((i) => i.kind === "GENERATED").length,
  };

  const tagNames = prepared.tags
    .map((t) => t.name)
    .sort()
    .slice(0, 300);

  const appLocalCalendarNames = prepared.appLocalCalendars.map((c) => c.name).slice(0, 100);

  const chatThreadSummaries = prepared.chatThreads.slice(0, 60).map((t) => {
    const ymd = entryYmdById.get(t.entryId) ?? "?";
    const title = t.title?.trim() || "（タイトルなし）";
    return `${ymd} · ${title}`;
  });

  const googleCalendarSampleTitles = prepared.googleCalendarEventCache
    .slice(0, 40)
    .map((e) => e.title);

  const memoryShortTermEntryDates = [
    ...new Set(
      prepared.memoryShortTerm
        .map((m) => entryYmdById.get(m.entryId))
        .filter((d): d is string => typeof d === "string"),
    ),
  ].sort();

  const agentMemoryLines = prepared.agentMemory.slice(0, 50).map((m) => {
    const v = previewBodyForUi(m.memoryValue, 200);
    return `${m.domain} · ${m.memoryKey}: ${v}`;
  });

  const usageCounterDatesYmd = [...new Set(prepared.usageCounters.map((u) => u.dateYmd))].sort();

  return {
    entryDatesYmd,
    imageByKind,
    tagNames,
    appLocalCalendarNames,
    chatThreadSummaries,
    googleCalendarSampleTitles,
    memoryLongTermCount: prepared.memoryLongTerm.length,
    memoryShortTermEntryDates,
    agentMemoryLines,
    usageCounterDatesYmd,
  };
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
  const bundleSettingsObj =
    decrypted.data.user.settings &&
    typeof decrypted.data.user.settings === "object" &&
    !Array.isArray(decrypted.data.user.settings)
      ? (decrypted.data.user.settings as Record<string, unknown>)
      : {};
  const conflictingSettingsDetail = buildConflictingSettingsDetail(
    conflicting,
    bundleSettingsObj,
    targetSettingsObj,
  );

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

  const { overlapDateRows, newImportDates } = await buildOverlapDateRows(
    decrypted.data,
    targetUserId,
  );

  const importPreviewDetail = buildImportPreviewDetail(preparedPreview);

  return {
    ok: true,
    summary,
    targetHasEntries: targetExistingDailyCount > 0,
    targetSettingsKeys,
    conflictingSettingsKeys: conflicting,
    conflictingSettingsDetail,
    importPlan,
    importPreviewCounts,
    importPreviewBlobs: {
      count: preparedPreview.images.length,
      totalBytes: importPreviewBlobsTotalBytes,
    },
    importPreviewDetail,
    overlapDateRows,
    newImportDates,
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
 * 日付が重なる日は既定でスキップ。overlapChoices で上書き／本文結合を指定可能。
 */
export async function applyImport(
  bundleJwe: string,
  passphrase: string,
  targetUserId: string,
  settingsSourceKeys: string[],
  overlapChoices: Record<string, OverlapChoice> = {},
): Promise<ImportApplyResult> {
  const decrypted = await decryptBundle(bundleJwe, passphrase);
  const data = decrypted.data;

  const initialTargets = await prisma.dailyEntry.findMany({
    where: { userId: targetUserId },
    select: { id: true, entryDateYmd: true },
  });
  const initialExistingDates = new Set(initialTargets.map((r) => r.entryDateYmd));
  const targetByYmd = new Map(initialTargets.map((t) => [t.entryDateYmd, { id: t.id }]));
  const targetExistingDailyCount = initialTargets.length;

  const replaceDates = [
    ...new Set(
      data.dailyEntries
        .filter((e) => initialExistingDates.has(e.entryDateYmd))
        .filter((e) => overlapChoices[e.entryDateYmd] === "replace")
        .map((e) => e.entryDateYmd),
    ),
  ];

  const occupiedAfterReplace = new Set(initialExistingDates);
  for (const d of replaceDates) occupiedAfterReplace.delete(d);

  const { prepared, mergeJobs } = buildImportPayload(
    data,
    overlapChoices,
    occupiedAfterReplace,
    targetByYmd,
  );

  const stripGlobals = shouldStripGlobalsForImport(
    targetExistingDailyCount > 0,
    overlapChoices,
    data,
    initialExistingDates,
  );
  const preparedFinal = stripGlobals ? stripBundledGlobalSnapshotRows(prepared) : prepared;

  const hasDailyOrMerge =
    preparedFinal.dailyEntries.length > 0 || mergeJobs.length > 0;
  if (data.dailyEntries.length > 0 && !hasDailyOrMerge) {
    return {
      ok: false,
      error: {
        kind: "all_entries_date_overlap",
        message:
          "取り込む日記がありません。重複日で「スキップ」以外を選ぶか、重複しない日付のバンドルをご利用ください。",
      },
    };
  }

  const blobsTotalBytes = Array.from(decrypted.blobs.values()).reduce(
    (s, b) => s + b.bytes.byteLength,
    0,
  );
  const summary = summarizeBundleData(preparedFinal, blobsTotalBytes);

  const combinedTags = collectTagsForPreparedAndMerges(
    preparedFinal,
    mergeJobs,
    data.tags,
  );
  const preparedForMap = { ...preparedFinal, tags: combinedTags };
  const idMap = buildIdMap(preparedForMap);
  allocateIdsForMergeJobs(mergeJobs, idMap);

  const existingTags = await prisma.tag.findMany({
    where: { userId: targetUserId },
    select: { id: true, name: true },
  });
  const tagNameToId = new Map(existingTags.map((t) => [t.name, t.id]));
  for (const t of combinedTags) {
    const hit = tagNameToId.get(t.name);
    if (hit) idMap.tags.set(t.id, hit);
  }
  const tagsToCreate = combinedTags.filter((t) => !tagNameToId.has(t.name));

  const mergeImages = mergeJobs.flatMap((j) => j.images);
  const allImages = [...preparedFinal.images, ...mergeImages];
  const stagedKeys = await stageBlobs(decrypted, idMap, targetUserId, allImages);

  const skipDuplicateGlobals = targetExistingDailyCount > 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        if (replaceDates.length > 0) {
          await tx.dailyEntry.deleteMany({
            where: { userId: targetUserId, entryDateYmd: { in: replaceDates } },
          });
        }
        await applyUserSettings(tx, targetUserId, data, settingsSourceKeys);
        await insertAllRows(tx, targetUserId, preparedFinal, idMap, tagsToCreate, {
          skipDuplicateGlobals,
        });
        await applyMergeJobsInTx(tx, targetUserId, mergeJobs, idMap, {
          skipDuplicateGlobals,
        });
      },
      { timeout: 120_000, maxWait: 15_000 },
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
          const created = new Date(r.createdAt);
          return {
            id: idMap.chatMessages.get(r.id)!,
            threadId: t,
            role: r.role,
            content: r.content,
            model: r.model,
            latencyMs: r.latencyMs,
            tokenEstimate: r.tokenEstimate,
            agentName: r.agentName,
            createdAt: created,
            updatedAt: r.updatedAt ? new Date(r.updatedAt) : created,
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
