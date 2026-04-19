const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GOOGLE_PHOTOS_SELECTIONS_CHANGED = "daily-snap:google-photo-selections-changed";

export type GooglePhotosPickerImportOutcome =
  | { ok: true; message: string; importedCount: number; skippedCount: number; totalSelected: number }
  | { ok: false; error: string };

/** 公式推奨: 選択完了後に Google 側タブを閉じる */
export function appendAutocloseToGooglePickerUri(pickerUri: string): string {
  if (/\/autoclose(\?|$)/.test(pickerUri)) return pickerUri;
  try {
    const u = new URL(pickerUri);
    u.pathname = `${u.pathname.replace(/\/$/, "")}/autoclose`;
    return u.href;
  } catch {
    return `${pickerUri.replace(/\/$/, "")}/autoclose`;
  }
}

export function openGooglePhotosPickerWindow(pickerUri: string): void {
  const url = appendAutocloseToGooglePickerUri(pickerUri);
  const w = 1180;
  const h = 820;
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const vw = window.outerWidth ?? document.documentElement.clientWidth ?? 1200;
  const vh = window.outerHeight ?? document.documentElement.clientHeight ?? 800;
  const left = Math.max(0, dualScreenLeft + (vw - w) / 2);
  const top = Math.max(0, dualScreenTop + (vh - h) / 2);
  window.open(
    url,
    "dailySnapGooglePhotosPicker",
    `popup=yes,width=${w},height=${h},left=${Math.floor(left)},top=${Math.floor(top)},scrollbars=yes,resizable=yes`,
  );
}

function buildImportMessage(imported: number, skipped: number, total: number, entryDateYmd: string): string {
  if (imported > 0 && skipped === 0) {
    return `Google Photos から ${imported} 件取り込みました。`;
  }
  if (imported > 0 && skipped > 0) {
    return `Google Photos から ${imported} 件を取り込みました（${skipped} 件は撮影日が「${entryDateYmd}」（東京）と一致しないため除外しました）。`;
  }
  if (imported === 0 && skipped > 0) {
    return `選択された ${total} 件のうち、撮影日が「${entryDateYmd}」（東京）と一致する写真はありませんでした（${skipped} 件を除外しました）。`;
  }
  if (imported === 0 && total === 0) {
    return "選択されたメディアがありませんでした。";
  }
  if (imported === 0 && skipped === 0 && total > 0) {
    return `選択は ${total} 件ありましたが、保存に必要なデータを解釈できませんでした。アプリを更新するか、しばらくしてから再度お試しください。`;
  }
  return `処理が完了しました（取り込み ${imported} 件）。`;
}

/**
 * Google Photos Picker を開き、選択のうちエントリ日（東京の撮影日）に一致するものだけをダウンロードして `images` に保存します。
 */
export async function runGooglePhotosPickerImport(args: {
  entryDateYmd: string;
  entryId: string;
  /** 既定は中央寄せポップアップ（/autoclose 付与済み） */
  openPicker?: (pickerUri: string) => void;
}): Promise<GooglePhotosPickerImportOutcome> {
  const { entryDateYmd, entryId } = args;
  if (!YMD_RE.test(entryDateYmd)) {
    return { ok: false, error: "日付が不正です" };
  }

  const startRes = await fetch("/api/google-photos/picker/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryDateYmd, entryId }),
  });
  const startJson = (await startRes.json().catch(() => ({}))) as {
    sessionId?: string;
    pickerUri?: string;
    pollIntervalSeconds?: number;
    error?: string;
  };
  if (!startRes.ok || !startJson.sessionId || !startJson.pickerUri) {
    return { ok: false, error: startJson.error ?? "Google Photos Picker の起動に失敗しました" };
  }

  const open = args.openPicker ?? openGooglePhotosPickerWindow;
  open(startJson.pickerUri);

  const intervalMs = Math.max(2000, (startJson.pollIntervalSeconds ?? 3) * 1000);
  const started = Date.now();
  const timeoutMs = 4 * 60 * 1000;

  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const poll = await fetch(
      `/api/google-photos/picker/session?sessionId=${encodeURIComponent(startJson.sessionId)}&import=1&entryDateYmd=${encodeURIComponent(entryDateYmd)}&entryId=${encodeURIComponent(entryId)}`,
      { cache: "no-store" },
    );
    const pollJson = (await poll.json().catch(() => ({}))) as {
      mediaItemsSet?: boolean;
      imported?: number;
      total?: number;
      skipped?: number;
      error?: string;
    };
    if (!poll.ok) {
      return { ok: false, error: pollJson.error ?? "Google Photos の取得に失敗しました" };
    }
    if (pollJson.mediaItemsSet) {
      const imported = pollJson.imported ?? 0;
      const total = pollJson.total ?? 0;
      const skipped = pollJson.skipped ?? Math.max(0, total - imported);
      return {
        ok: true,
        message: buildImportMessage(imported, skipped, total, entryDateYmd),
        importedCount: imported,
        skippedCount: skipped,
        totalSelected: total,
      };
    }
  }

  return {
    ok: true,
    message: "選択待ちのため取り込みは未完了です。あとで再実行できます。",
    importedCount: 0,
    skippedCount: 0,
    totalSelected: 0,
  };
}

export function notifyGooglePhotoSelectionsChanged(entryDateYmd: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GOOGLE_PHOTOS_SELECTIONS_CHANGED, { detail: { entryDateYmd } }));
}
