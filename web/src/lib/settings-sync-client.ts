/** 他タブ即時通知用（同一オリジン・同一ブラウザ） */
export const SETTINGS_SYNC_BROADCAST_CHANNEL = "dairy-snap-settings-sync";

/** 同一タブで PATCH 成功後に lastToken を更新する */
export const LOCAL_SETTINGS_SAVED_EVENT = "dairy-snap:local-settings-saved";

/** 他端末・他タブでサーバー上の設定が変わった（再取得が必要） */
export const REMOTE_SETTINGS_UPDATED_EVENT = "dairy-snap:settings-remote-updated";

export function extractServerSyncToken(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const t = (json as Record<string, unknown>).serverSyncToken;
  return typeof t === "string" && t.length > 0 ? t : null;
}

/** PATCH 成功レスポンスからトークンを取り、同一タブのプロバイダ参照を更新し、他タブへブロードキャストする */
export function emitLocalSettingsSaved(serverSyncToken: string | null | undefined) {
  if (typeof window === "undefined" || !serverSyncToken) return;
  window.dispatchEvent(
    new CustomEvent(LOCAL_SETTINGS_SAVED_EVENT, {
      detail: { serverSyncToken },
    }),
  );
  try {
    const bc = new BroadcastChannel(SETTINGS_SYNC_BROADCAST_CHANNEL);
    bc.postMessage({ serverSyncToken });
    bc.close();
  } catch {
    /* ignore */
  }
}

export function emitLocalSettingsSavedFromJson(json: unknown) {
  emitLocalSettingsSaved(extractServerSyncToken(json));
}
