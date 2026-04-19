"use client";

import { GooglePhotosImportDialog } from "@/components/google-photos-import-dialog";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { compressImageForDailyEntry, uploadEntryImage } from "@/lib/entry-image-upload-client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Img = {
  id: string;
  mimeType: string;
  byteSize: number;
};

export function EntryImages({
  entryId,
  entryDateYmd,
  images,
  /** 日記草案プレビューの右欄など。lg 以上は 1 行の横スクロール。未指定は常にグリッド */
  galleryLayout = "default",
}: {
  entryId: string;
  entryDateYmd: string;
  images: Img[];
  galleryLayout?: "default" | "journalPreviewAside";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googlePhotosDialogOpen, setGooglePhotosDialogOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function processFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = [...fileList].filter((f) => f.type.startsWith("image/") || !f.type);
    if (!files.length) {
      setError("画像ファイルを選んでください");
      return;
    }
    setError(null);
    setBusy(true);
    const errors: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadLabel(`${i + 1} / ${files.length} 枚を処理中…`);
        try {
          const compressed = await compressImageForDailyEntry(files[i]);
          const up = await uploadEntryImage(entryId, compressed);
          if (!up.ok) errors.push(up.error);
        } catch {
          errors.push(`${files[i].name}: 処理に失敗しました`);
        }
      }
      if (errors.length) {
        setError(errors.slice(0, 3).join(" ") + (errors.length > 3 ? ` 他${errors.length - 3}件` : ""));
      }
      router.refresh();
    } finally {
      setBusy(false);
      setUploadLabel(null);
    }
  }

  async function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    await processFiles(e.target.files);
    e.target.value = "";
  }

  function openGalleryPicker() {
    setAddSourceOpen(false);
    queueMicrotask(() => galleryInputRef.current?.click());
  }

  function openCameraPicker() {
    setAddSourceOpen(false);
    queueMicrotask(() => cameraInputRef.current?.click());
  }

  function openGoogleFromSheet() {
    setAddSourceOpen(false);
    setGooglePhotosDialogOpen(true);
  }

  async function deleteImage(imageId: string) {
    if (!window.confirm("この画像を削除しますか？ストレージからも消え、元に戻せません。")) return;
    setError(null);
    setDeletingId(imageId);
    try {
      const res = await fetch(`/api/images/${imageId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "削除に失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const hasAny = images.length > 0;
  const asideGallery = galleryLayout === "journalPreviewAside";

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">写真・画像</h2>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {uploadLabel && <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">{uploadLabel}</p>}

      {hasAny ? (
        <div className="space-y-2">
          <div
            className={
              asideGallery
                ? "max-lg:grid max-lg:grid-cols-6 max-lg:gap-1 max-lg:overflow-x-visible lg:flex lg:flex-nowrap lg:gap-1.5 lg:overflow-x-auto lg:overflow-y-visible lg:pb-0.5 lg:[scrollbar-width:thin]"
                : "grid grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-2"
            }
          >
            {images.map((img) => (
              <div
                key={img.id}
                className={`relative overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-lg ${
                  asideGallery
                    ? "aspect-square max-lg:min-w-0 lg:aspect-square lg:h-20 lg:w-20 lg:max-w-none lg:shrink-0"
                    : "aspect-square"
                }`}
              >
                <a
                  href={`/api/images/${img.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${img.id}`}
                    alt=""
                    className="h-full w-full max-w-full object-cover"
                    sizes={
                      asideGallery
                        ? "(min-width: 1024px) 80px, (max-width: 1023px) 16vw"
                        : "(max-width: 639px) 30vw, (max-width: 1024px) 33vw, 320px"
                    }
                    loading="lazy"
                    decoding="async"
                  />
                </a>
                <button
                  type="button"
                  disabled={busy || deletingId !== null}
                  onClick={() => void deleteImage(img.id)}
                  aria-label="この画像を削除"
                  className={`absolute flex items-center justify-center rounded-md bg-zinc-950/80 font-light leading-none text-white shadow-sm backdrop-blur-sm hover:bg-red-700/95 disabled:opacity-50 dark:bg-zinc-950/85 dark:hover:bg-red-600/95 ${
                    asideGallery
                      ? "right-0.5 top-0.5 max-lg:min-h-7 max-lg:min-w-7 max-lg:text-xs lg:right-0.5 lg:top-0.5 lg:min-h-7 lg:min-w-7 lg:text-sm"
                      : "right-0.5 top-0.5 min-h-7 min-w-7 text-sm sm:right-1 sm:top-1 sm:min-h-[32px] sm:min-w-[32px] sm:text-base"
                  }`}
                >
                  <span aria-hidden className="translate-y-[-0.5px]">
                    ×
                  </span>
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{images.length} 枚</p>
          <button
            type="button"
            disabled={busy || deletingId !== null}
            onClick={() => setAddSourceOpen(true)}
            className="text-[11px] font-medium text-emerald-700 underline decoration-emerald-700/40 underline-offset-2 hover:text-emerald-800 disabled:opacity-50 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            写真を追加
          </button>
        </div>
      ) : (
        <>
          <p className="rounded-lg border border-dashed border-zinc-200/90 bg-zinc-50/40 px-3 py-2 text-[11px] leading-snug text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
            まだこの日の写真・画像はありません。下のボタンから、ライブラリ・カメラ・Google フォトのいずれかで追加できます。
          </p>
          <button
            type="button"
            disabled={busy || deletingId !== null}
            onClick={() => setAddSourceOpen(true)}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {busy ? "処理中…" : "写真を追加"}
          </button>
        </>
      )}

      <div className="sr-only" aria-hidden>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          onChange={onFileInput}
          disabled={busy || deletingId !== null}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          onChange={onFileInput}
          disabled={busy || deletingId !== null}
        />
      </div>

      <ResponsiveDialog
        open={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
        labelledBy="entry-images-add-source-title"
        dialogId="entry-images-add-source-dialog"
        zClass="z-[60]"
        presentation="sheet"
      >
        <div className="border-b border-zinc-200 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800">
          <h2 id="entry-images-add-source-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            追加方法を選ぶ
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">ライブラリ・カメラ・Google フォトのいずれか</p>
        </div>
        <div className="flex flex-col gap-1.5 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy || deletingId !== null}
            onClick={() => openGalleryPicker()}
            className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            ライブラリ・ファイルから
          </button>
          <button
            type="button"
            disabled={busy || deletingId !== null}
            onClick={() => openCameraPicker()}
            className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            カメラで撮る
          </button>
          <button
            type="button"
            disabled={busy || deletingId !== null}
            onClick={() => openGoogleFromSheet()}
            className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Google フォトから
          </button>
          <button
            type="button"
            onClick={() => setAddSourceOpen(false)}
            className="mt-0.5 min-h-[40px] w-full rounded-xl border border-zinc-200 px-3 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
        </div>
      </ResponsiveDialog>

      <GooglePhotosImportDialog
        open={googlePhotosDialogOpen}
        onClose={() => setGooglePhotosDialogOpen(false)}
        entryDateYmd={entryDateYmd}
        entryId={entryId}
        title="Google Photos から追加"
        instanceId="entry-images"
      />
    </section>
  );
}
