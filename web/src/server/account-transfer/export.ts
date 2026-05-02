import { createHash } from "node:crypto";
import {
  BUNDLE_SCHEMA_VERSION,
  type BundleData,
} from "@/lib/account-transfer/bundle-schema";
import { encryptBundle, type BundleBlob } from "@/server/account-transfer/bundle-codec";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function isoOrEmpty(d: Date | null | undefined): string {
  return d ? d.toISOString() : new Date(0).toISOString();
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***" + email.slice(at);
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 2)}***${local.slice(-1)}${domain}`;
}

function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

/** 指定ユーザーの全データを読み出してバンドル data を組み立てる（EXPERIMENTAL_E2EE 日記は除外） */
async function readUserBundleData(userId: string): Promise<BundleData> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const allEntries = await prisma.dailyEntry.findMany({ where: { userId } });
  const skippedEntryIds = new Set(
    allEntries.filter((e) => e.encryptionMode !== "STANDARD").map((e) => e.id),
  );
  const standardEntries = allEntries.filter((e) => e.encryptionMode === "STANDARD");
  const standardEntryIds = standardEntries.map((e) => e.id);

  const [
    appendEvents,
    images,
    photoSelections,
    tags,
    entryTags,
    gcalCache,
    gcalSync,
    appCalendars,
    appCalEvents,
    chatThreads,
    aiArtifacts,
    longTerm,
    shortTerm,
    agentMemory,
    usageCounters,
  ] = await Promise.all([
    prisma.entryAppendEvent.findMany({ where: { entryId: { in: standardEntryIds } } }),
    prisma.image.findMany({ where: { entryId: { in: standardEntryIds } } }),
    prisma.googlePhotoSelection.findMany({ where: { userId } }),
    prisma.tag.findMany({ where: { userId } }),
    prisma.entryTag.findMany({ where: { entryId: { in: standardEntryIds } } }),
    prisma.googleCalendarEventCache.findMany({ where: { userId } }),
    prisma.googleCalendarSyncState.findMany({ where: { userId } }),
    prisma.appLocalCalendar.findMany({ where: { userId } }),
    prisma.appLocalCalendarEvent.findMany({ where: { userId } }),
    prisma.chatThread.findMany({ where: { entryId: { in: standardEntryIds } } }),
    prisma.aIArtifact.findMany({ where: { userId } }),
    prisma.memoryLongTerm.findMany({ where: { userId } }),
    prisma.memoryShortTerm.findMany({ where: { userId, entryId: { in: standardEntryIds } } }),
    prisma.agentMemory.findMany({ where: { userId } }),
    prisma.usageCounter.findMany({ where: { userId } }),
  ]);

  const threadIds = chatThreads.map((t) => t.id);
  const chatMessages = threadIds.length
    ? await prisma.chatMessage.findMany({ where: { threadId: { in: threadIds } } })
    : [];

  const settingsObj =
    user.settings && typeof user.settings === "object" && !Array.isArray(user.settings)
      ? (user.settings as Record<string, unknown>)
      : {};

  const data: BundleData = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      userIdHash: hashUserId(user.id),
      emailMasked: maskEmail(user.email),
    },
    user: {
      name: user.name ?? null,
      image: user.image ?? null,
      timeZone: user.timeZone,
      encryptionMode: user.encryptionMode,
      settings: settingsObj,
    },
    skippedE2eeEntries: skippedEntryIds.size,

    dailyEntries: standardEntries.map((e) => ({
      id: e.id,
      entryDateYmd: e.entryDateYmd,
      title: e.title ?? null,
      mood: e.mood ?? null,
      body: e.body,
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      weatherPeriod: e.weatherPeriod ?? null,
      weatherJson: (e.weatherJson ?? null) as unknown,
      encryptionMode: "STANDARD" as const,
      encryptionMeta: e.encryptionMeta as unknown,
      plutchikAnalysis: (e.plutchikAnalysis ?? null) as unknown,
      dominantEmotion: e.dominantEmotion ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    entryAppendEvents: appendEvents.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      occurredAt: r.occurredAt.toISOString(),
      fragment: r.fragment,
      createdAt: r.createdAt.toISOString(),
    })),
    images: images.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      kind: r.kind,
      storageKey: r.storageKey,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
      sha256: r.sha256 ?? null,
      googleMediaItemId: r.googleMediaItemId ?? null,
      rotationQuarterTurns: r.rotationQuarterTurns,
      caption: r.caption,
      width: r.width ?? null,
      height: r.height ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    googlePhotoSelections: photoSelections
      .filter((r) => !r.entryId || !skippedEntryIds.has(r.entryId))
      .map((r) => ({
        id: r.id,
        entryId: r.entryId ?? null,
        entryDateYmd: r.entryDateYmd,
        providerSessionId: r.providerSessionId ?? null,
        mediaItemId: r.mediaItemId,
        baseUrl: r.baseUrl,
        productUrl: r.productUrl ?? null,
        mimeType: r.mimeType ?? null,
        filename: r.filename ?? null,
        width: r.width ?? null,
        height: r.height ?? null,
        creationTime: isoOrNull(r.creationTime),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    tags: tags.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
    })),
    entryTags: entryTags.map((r) => ({ entryId: r.entryId, tagId: r.tagId })),
    googleCalendarEventCache: gcalCache.map((r) => ({
      id: r.id,
      calendarId: r.calendarId,
      eventId: r.eventId,
      calendarName: r.calendarName ?? null,
      calendarColorId: r.calendarColorId ?? null,
      eventColorId: r.eventColorId ?? null,
      title: r.title,
      location: r.location,
      description: r.description,
      eventPayload: (r.eventPayload ?? null) as unknown,
      eventSearchBlob: r.eventSearchBlob,
      startIso: r.startIso,
      endIso: r.endIso,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      fixedCategory: r.fixedCategory ?? null,
      isCancelled: r.isCancelled,
      updatedAtGcal: isoOrNull(r.updatedAtGcal),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    googleCalendarSyncState: gcalSync.map((r) => ({
      id: r.id,
      calendarId: r.calendarId,
      lastSyncAt: isoOrNull(r.lastSyncAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    appLocalCalendars: appCalendars.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    appLocalCalendarEvents: appCalEvents.map((r) => ({
      id: r.id,
      calendarId: r.calendarId,
      title: r.title,
      description: r.description,
      location: r.location,
      startIso: r.startIso,
      endIso: r.endIso,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    chatThreads: chatThreads.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      title: r.title ?? null,
      conversationNotes: r.conversationNotes as unknown,
      memoryChatBackfillAt: isoOrNull(r.memoryChatBackfillAt),
      memoryChatBackfillMsgCount: r.memoryChatBackfillMsgCount ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    chatMessages: chatMessages.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      role: r.role,
      content: r.content,
      model: r.model ?? null,
      latencyMs: r.latencyMs ?? null,
      tokenEstimate: r.tokenEstimate ?? null,
      agentName: r.agentName ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    aiArtifacts: aiArtifacts
      .filter((r) => !r.entryId || !skippedEntryIds.has(r.entryId))
      .map((r) => ({
        id: r.id,
        entryId: r.entryId ?? null,
        kind: r.kind,
        promptVersion: r.promptVersion ?? null,
        model: r.model ?? null,
        latencyMs: r.latencyMs ?? null,
        tokenEstimate: r.tokenEstimate ?? null,
        cacheKey: r.cacheKey ?? null,
        cacheHit: r.cacheHit,
        metadata: r.metadata as unknown,
        createdAt: r.createdAt.toISOString(),
      })),
    memoryLongTerm: longTerm
      .filter((r) => !r.sourceEntryId || !skippedEntryIds.has(r.sourceEntryId))
      .map((r) => ({
        id: r.id,
        sourceEntryId: r.sourceEntryId ?? null,
        bullets: r.bullets as unknown,
        attributes: r.attributes as unknown,
        impactScore: r.impactScore,
        createdAt: r.createdAt.toISOString(),
      })),
    memoryShortTerm: shortTerm.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      bullets: r.bullets as unknown,
      salience: r.salience,
      dedupKey: r.dedupKey ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    agentMemory: agentMemory.map((r) => ({
      id: r.id,
      domain: r.domain,
      memoryKey: r.memoryKey,
      memoryValue: r.memoryValue,
      confidence: r.confidence,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    usageCounters: usageCounters.map((r) => ({
      id: r.id,
      dateYmd: r.dateYmd,
      chatMessages: r.chatMessages,
      imageGenerations: r.imageGenerations,
      dailySummaries: r.dailySummaries,
      orchestratorCalls: r.orchestratorCalls,
      memorySubAgentCalls: r.memorySubAgentCalls,
      settingsChanges: r.settingsChanges,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };

  void isoOrEmpty;
  return data;
}

/** バンドル本体（暗号化文字列）と平文サイズを返す */
export async function buildEncryptedBundle(
  userId: string,
  passphrase: string,
): Promise<{ encryptedBundle: string; byteLength: number; imageCount: number }> {
  const data = await readUserBundleData(userId);

  const storage = getObjectStorage();
  const blobs: BundleBlob[] = [];
  for (const img of data.images) {
    const bytes = await storage.get(img.storageKey);
    if (!bytes) {
      // ファイルが見つからない場合はスキップせず、ゼロバイトとして扱う
      // （DB と整合させるため）— ただし sha256 は計算可能な実値を保持
      const empty = Buffer.alloc(0);
      blobs.push({
        sourceStorageKey: img.storageKey,
        bytes: empty,
        mimeType: img.mimeType,
        sha256: createHash("sha256").update(empty).digest("hex"),
      });
      continue;
    }
    blobs.push({
      sourceStorageKey: img.storageKey,
      bytes: bytes,
      mimeType: img.mimeType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  const encryptedBundle = await encryptBundle(data, blobs, passphrase);
  const byteLength = blobs.reduce((s, b) => s + b.bytes.byteLength, 0) + JSON.stringify(data).length;
  return { encryptedBundle, byteLength, imageCount: blobs.length };
}
