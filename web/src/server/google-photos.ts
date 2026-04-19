import { google } from "googleapis";
import { prisma } from "@/server/db";

const PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

type PickerSessionResponse = {
  id?: string;
  pickerUri?: string;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
  mediaItemsSet?: boolean;
};

type PickerMediaItem = {
  id?: string;
  baseUrl?: string;
  productUrl?: string;
  mimeType?: string;
  filename?: string;
  mediaFile?: { width?: string; height?: string };
  mediaMetadata?: { creationTime?: string };
};

async function getGoogleAccessToken(userId: string): Promise<string> {
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
    body: JSON.stringify({
      pickingOptions: {
        allowDuplicates: false,
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

export async function importGooglePhotosFromSession(args: {
  userId: string;
  sessionId: string;
  entryDateYmd: string;
  entryId?: string;
}): Promise<{ imported: number; total: number }> {
  const accessToken = await getGoogleAccessToken(args.userId);
  const url = `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(args.sessionId)}/mediaItems?pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { mediaItems?: PickerMediaItem[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Google Photos mediaItems 取得に失敗 (${res.status})`);
  }

  const list = Array.isArray(json.mediaItems) ? json.mediaItems : [];
  let imported = 0;

  for (const item of list) {
    const mediaItemId = item.id?.trim();
    const baseUrl = item.baseUrl?.trim();
    if (!mediaItemId || !baseUrl) continue;

    const width = Number(item.mediaFile?.width);
    const height = Number(item.mediaFile?.height);
    const creationTimeRaw = item.mediaMetadata?.creationTime;

    await prisma.googlePhotoSelection.upsert({
      where: {
        userId_entryDateYmd_mediaItemId: {
          userId: args.userId,
          entryDateYmd: args.entryDateYmd,
          mediaItemId,
        },
      },
      create: {
        userId: args.userId,
        entryId: args.entryId,
        entryDateYmd: args.entryDateYmd,
        providerSessionId: args.sessionId,
        mediaItemId,
        baseUrl,
        productUrl: item.productUrl ?? null,
        mimeType: item.mimeType ?? null,
        filename: item.filename ?? null,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
        creationTime: creationTimeRaw ? new Date(creationTimeRaw) : null,
      },
      update: {
        entryId: args.entryId,
        providerSessionId: args.sessionId,
        baseUrl,
        productUrl: item.productUrl ?? null,
        mimeType: item.mimeType ?? null,
        filename: item.filename ?? null,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
        creationTime: creationTimeRaw ? new Date(creationTimeRaw) : null,
      },
    });
    imported += 1;
  }

  return { imported, total: list.length };
}

export { PICKER_SCOPE };
