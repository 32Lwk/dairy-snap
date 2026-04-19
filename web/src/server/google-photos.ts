import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { sha256Hex } from "@/lib/crypto/sha256";
import { extFromMime, MAX_IMAGES_PER_ENTRY, MAX_TOTAL_IMAGE_BYTES_PER_ENTRY } from "@/lib/entry-image-limits";
import { mediaCreationMatchesEntryYmd } from "@/lib/google-photos-entry-date";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";

const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

type PickerSessionResponse = {
  id?: string;
  pickerUri?: string;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
  mediaItemsSet?: boolean;
};

/** https://developers.google.com/photos/picker/reference/rest/v1/mediaItems#PickedMediaItem */
type PickedMediaItemApi = {
  id?: string;
  /** メディアの作成時刻（撮影日の判定に使う） */
  createTime?: string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
  /** 旧想定の冗長形が来た場合のフォールバック用 */
  baseUrl?: string;
  productUrl?: string;
  mimeType?: string;
  filename?: string;
  mediaMetadata?: { creationTime?: string };
  mediaFileLegacy?: { width?: string; height?: string };
};

function pickedItemBaseUrl(item: PickedMediaItemApi): string | undefined {
  const u = item.mediaFile?.baseUrl?.trim() || item.baseUrl?.trim();
  return u || undefined;
}

function pickedItemCreationTime(item: PickedMediaItemApi): Date | null {
  const raw = item.createTime?.trim() || item.mediaMetadata?.creationTime?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildGooglePickerMediaUrl(base: string, w: number, h: number): string {
  const b = base.trim();
  return b.includes("=") ? b : `${b}=w${w}-h${h}-c`;
}

async function fetchGooglePickerImageBytes(
  accessToken: string,
  baseUrl: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  const mediaUrl = buildGooglePickerMediaUrl(baseUrl, 2048, 2048);
  const upstream = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "follow",
    cache: "no-store",
  });
  if (!upstream.ok) return null;
  const buf = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return { buf, contentType };
}

type GooglePhotoSaveResult = "saved" | "dup" | "limit" | "fetch" | "bad";

async function trySaveGooglePickerMediaAsEntryImage(params: {
  userId: string;
  entryId: string;
  accessToken: string;
  mediaItemId: string;
  baseUrl: string;
  mimeHint: string | null;
}): Promise<GooglePhotoSaveResult> {
  const dup = await prisma.image.findFirst({
    where: { entryId: params.entryId, googleMediaItemId: params.mediaItemId },
    select: { id: true },
  });
  if (dup) return "dup";

  const entry = await prisma.dailyEntry.findUnique({
    where: { id: params.entryId },
    select: { images: { select: { byteSize: true } } },
  });
  if (!entry) return "bad";

  const imageCount = entry.images.length;
  const totalBytes = entry.images.reduce((s, i) => s + i.byteSize, 0);
  if (imageCount >= MAX_IMAGES_PER_ENTRY) return "limit";

  const fetched = await fetchGooglePickerImageBytes(params.accessToken, params.baseUrl);
  if (!fetched) return "fetch";

  const maxSingle = MAX_TOTAL_IMAGE_BYTES_PER_ENTRY - totalBytes;
  if (fetched.buf.length > maxSingle) return "limit";

  const mime =
    fetched.contentType.startsWith("image/") && fetched.contentType !== "application/octet-stream"
      ? fetched.contentType
      : params.mimeHint && params.mimeHint.startsWith("image/")
        ? params.mimeHint
        : "image/jpeg";
  const ext = extFromMime(mime);
  const id = randomUUID();
  const storageKey = `${params.userId}/${params.entryId}/${id}.${ext}`;
  const storage = getObjectStorage();
  await storage.put({ key: storageKey, body: fetched.buf, contentType: mime });

  await prisma.image.create({
    data: {
      entryId: params.entryId,
      kind: "UPLOADED",
      storageKey,
      mimeType: mime,
      byteSize: fetched.buf.length,
      sha256: sha256Hex(fetched.buf),
      googleMediaItemId: params.mediaItemId,
    },
  });
  return "saved";
}

/** Picker で得た baseUrl 取得時の Bearer に使う（プレビュー API からも利用） */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true },
  });
  if (!account?.refresh_token) {
    throw new Error("Google の refresh_token がありません。設定から再連携してください。");
  }
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth が未設定です。");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: account.refresh_token });
  const token = await oauth2.getAccessToken();
  if (!token.token) throw new Error("Google アクセストークンの取得に失敗しました。");
  return token.token;
}

export async function createGooglePhotosPickerSession(userId: string): Promise<PickerSessionResponse> {
  const accessToken = await getGoogleAccessToken(userId);
  const res = await fetch("https://photospicker.googleapis.com/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-Api-Client": "daily-snap-web",
    },
    // PickingSession の書き込み可能フィールドは pickingConfig のみ（旧 pickingOptions は無効）
    // https://developers.google.com/photos/picker/reference/rest/v1/sessions#PickingConfig
    body: JSON.stringify({
      pickingConfig: {
        maxItemCount: "10",
      },
    }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as PickerSessionResponse & { error?: { message?: string } };
  if (!res.ok) {
    const msg = json?.error?.message ?? `Google Photos Picker API エラー (${res.status})`;
    if (msg.includes("insufficientPermissions") || msg.includes("insufficient_scope")) {
      throw new Error(
        "Google Photos の権限が不足しています。設定から Google を再連携し、写真アクセスの同意を付与してください。",
      );
    }
    throw new Error(msg);
  }
  if (!json.id || !json.pickerUri) {
    throw new Error("Google Photos Picker セッションの作成に失敗しました。");
  }
  return json;
}

export async function getGooglePhotosPickerSession(userId: string, sessionId: string): Promise<PickerSessionResponse> {
  const accessToken = await getGoogleAccessToken(userId);
  const res = await fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as PickerSessionResponse & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Google Photos Picker session 取得に失敗 (${res.status})`);
  }
  return json;
}

/**
 * Picker セッションの選択を、Google からバイトを取得して `images`（オブジェクトストレージ）に保存する。
 * 旧 `google_photo_selection` のみの行は同じタイミングでファイル化し、行は削除する。
 */
export async function importGooglePhotosFromSession(args: {
  userId: string;
  sessionId: string;
  entryDateYmd: string;
  entryId?: string;
}): Promise<{ imported: number; total: number; skipped: number }> {
  const entry = await prisma.dailyEntry.findFirst({
    where: args.entryId
      ? { id: args.entryId, userId: args.userId }
      : { userId: args.userId, entryDateYmd: args.entryDateYmd },
    select: { id: true },
  });
  if (!entry) {
    throw new Error("日記エントリが見つかりません。ページを開き直してからお試しください。");
  }
  const entryId = entry.id;

  const accessToken = await getGoogleAccessToken(args.userId);

  const legacyRows = await prisma.googlePhotoSelection.findMany({
    where: { userId: args.userId, entryDateYmd: args.entryDateYmd },
    select: { id: true, mediaItemId: true, baseUrl: true, mimeType: true },
  });

  let imported = 0;
  let skippedDate = 0;
  let skippedDup = 0;
  let skippedLimit = 0;
  let skippedFetch = 0;
  let skippedBad = 0;

  for (const row of legacyRows) {
    const base = row.baseUrl?.trim();
    if (!base) {
      skippedBad += 1;
      continue;
    }
    const dup = await prisma.image.findFirst({
      where: { entryId, googleMediaItemId: row.mediaItemId },
      select: { id: true },
    });
    if (dup) {
      await prisma.googlePhotoSelection.delete({ where: { id: row.id } }).catch(() => {});
      skippedDup += 1;
      continue;
    }
    const r = await trySaveGooglePickerMediaAsEntryImage({
      userId: args.userId,
      entryId,
      accessToken,
      mediaItemId: row.mediaItemId,
      baseUrl: base,
      mimeHint: row.mimeType,
    });
    if (r === "saved") {
      imported += 1;
      await prisma.googlePhotoSelection.delete({ where: { id: row.id } }).catch(() => {});
    } else if (r === "dup") {
      await prisma.googlePhotoSelection.delete({ where: { id: row.id } }).catch(() => {});
      skippedDup += 1;
    } else if (r === "limit") skippedLimit += 1;
    else if (r === "fetch") skippedFetch += 1;
    else skippedBad += 1;
  }

  // 公式: GET v1/mediaItems に sessionId をクエリで渡す（sessions/.../mediaItems は 404）
  // https://developers.google.com/photos/picker/reference/rest/v1/mediaItems/list
  const list: PickedMediaItemApi[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      sessionId: args.sessionId,
      pageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://photospicker.googleapis.com/v1/mediaItems?${params.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      mediaItems?: PickedMediaItemApi[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json?.error?.message ?? `Google Photos mediaItems 取得に失敗 (${res.status})`);
    }
    const page = Array.isArray(json.mediaItems) ? json.mediaItems : [];
    list.push(...page);
    pageToken = json.nextPageToken?.trim() || undefined;
  } while (pageToken);

  for (const item of list) {
    const mediaItemId = item.id?.trim();
    const baseUrl = pickedItemBaseUrl(item);
    if (!mediaItemId || !baseUrl) {
      skippedBad += 1;
      continue;
    }

    const creationTime = pickedItemCreationTime(item);
    if (!mediaCreationMatchesEntryYmd(creationTime, args.entryDateYmd)) {
      skippedDate += 1;
      continue;
    }

    const mimeHint = item.mediaFile?.mimeType ?? item.mimeType ?? null;
    const r = await trySaveGooglePickerMediaAsEntryImage({
      userId: args.userId,
      entryId,
      accessToken,
      mediaItemId,
      baseUrl,
      mimeHint,
    });
    if (r === "saved") imported += 1;
    else if (r === "dup") skippedDup += 1;
    else if (r === "limit") skippedLimit += 1;
    else if (r === "fetch") skippedFetch += 1;
    else skippedBad += 1;
  }

  const skipped = skippedDate + skippedDup + skippedLimit + skippedFetch + skippedBad;
  return { imported, total: list.length, skipped };
}

export { PICKER_SCOPE };
