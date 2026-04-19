"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import imageCompression from "browser-image-compression";

type Img = {
  id: string;
  mimeType: string;
  byteSize: number;
};

export function EntryImages({ entryId, images }: { entryId: string; images: Img[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoInfo, setPhotoInfo] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<
    { id: string; thumbUrl: string; displayUrl: string; filename: string | null; productUrl: string | null }[]
  >([]);

  const dateYmd = useMemo(() => {
    if (typeof window === "undefined") return "";
    const seg = window.location.pathname.split("/").filter(Boolean);
    // /entries/YYYY-MM-DD
    const d = seg.length >= 2 ? seg[1] : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }, []);

  async function loadPicked() {
    if (!dateYmd) return;
    const res = await fetch(`/api/google-photos/items?date=${dateYmd}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      items?: { id: string; thumbUrl: string; displayUrl: string; filename: string | null; productUrl: string | null }[];
    };
    if (!res.ok) return;
    setPicked(Array.isArray(json.items) ? json.items : []);
  }

  useEffect(() => {
    void loadPicked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, dateYmd]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const avifOk = await supportsAvifEncode();
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        initialQuality: 0.85,
        fileType: avifOk ? "image/avif" : "image/webp",
      });
      const fd = new FormData();
      fd.append("file", compressed, compressed.name || "photo");
      const res = await fetch(`/api/entries/${entryId}/images`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "アップロードに失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function connectGooglePhotos() {
    if (!dateYmd) {
      setPhotoErr("日付を判定できませんでした。ページを再読み込みしてください。");
      return;
    }
    setPhotoErr(null);
    setPhotoInfo(null);
    setPhotoBusy(true);
    try {
      const startRes = await fetch("/api/google-photos/picker/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDateYmd: dateYmd, entryId }),
      });
      const startJson = (await startRes.json().catch(() => ({}))) as {
        sessionId?: string;
        pickerUri?: string;
        pollIntervalSeconds?: number;
        error?: string;
      };
      if (!startRes.ok || !startJson.sessionId || !startJson.pickerUri) {
        setPhotoErr(startJson.error ?? "Google Photos Picker の起動に失敗しました");
        return;
      }

      window.open(startJson.pickerUri, "_blank", "noopener,noreferrer");
      const intervalMs = Math.max(2000, (startJson.pollIntervalSeconds ?? 3) * 1000);
      const started = Date.now();
      const timeoutMs = 4 * 60 * 1000;
      let imported = false;

      while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const poll = await fetch(
          `/api/google-photos/picker/session?sessionId=${encodeURIComponent(startJson.sessionId)}&import=1&entryDateYmd=${encodeURIComponent(dateYmd)}&entryId=${encodeURIComponent(entryId)}`,
          { cache: "no-store" },
        );
        const pollJson = (await poll.json().catch(() => ({}))) as {
          mediaItemsSet?: boolean;
          imported?: number;
          total?: number;
          error?: string;
        };
        if (!poll.ok) {
          setPhotoErr(pollJson.error ?? "Google Photos の取得に失敗しました");
          return;
        }
        if (pollJson.mediaItemsSet) {
          imported = true;
          setPhotoInfo(`Google Photos から ${pollJson.imported ?? 0} 件取り込みました。`);
          break;
        }
      }
      if (!imported) setPhotoInfo("選択待ちのため取り込みは未完了です。あとで再実行できます。");
      await loadPicked();
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">画像</h2>
      <p className="text-xs text-zinc-500">1日最大10枚・合計50MB。AVIF優先（非対応時はWebP）。最大辺2048px。</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
          {busy ? "処理中…" : "画像を追加"}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
        </label>
        <button
          type="button"
          onClick={() => void connectGooglePhotos()}
          disabled={photoBusy}
          className="inline-flex rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {photoBusy ? "Google Photos 連携中…" : "Google Photos から選択"}
        </button>
      </div>
      {photoInfo ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{photoInfo}</p> : null}
      {photoErr ? <p className="text-xs text-red-600">{photoErr}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((img) => (
          <a
            key={img.id}
            href={`/api/images/${img.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${img.id}`}
              alt=""
              className="h-full w-full max-w-full object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
              loading="lazy"
              decoding="async"
            />
          </a>
        ))}
      </div>

      {picked.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Google Photos（この日で選択済み）</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {picked.map((p) => (
              <a
                key={p.id}
                href={p.productUrl || p.displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                title={p.filename ?? undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt={p.filename ?? "Google Photos"} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

async function supportsAvifEncode(): Promise<boolean> {
  if (typeof createImageBitmap === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  canvas.getContext("2d")?.fillRect(0, 0, 1, 1);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/avif"));
  return Boolean(blob && blob.size > 0);
}
