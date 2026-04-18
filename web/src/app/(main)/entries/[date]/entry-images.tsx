"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">画像</h2>
      <p className="text-xs text-zinc-500">1日最大10枚・合計50MB。AVIF優先（非対応時はWebP）。最大辺2048px。</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="inline-flex cursor-pointer rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
        {busy ? "処理中…" : "画像を追加"}
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
      </label>
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
