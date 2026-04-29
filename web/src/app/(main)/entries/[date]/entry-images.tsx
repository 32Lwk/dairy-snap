"use client";

import { GooglePhotosImportDialog } from "@/components/google-photos-import-dialog";
import { PhotosDailyQuotaBadge } from "@/components/photos-daily-quota-badge";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { compressImageForDailyEntry, uploadEntryImage } from "@/lib/entry-image-upload-client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Img = {
  id: string;
  mimeType: string;
  byteSize: number;
  rotationQuarterTurns?: number;
  caption?: string;
};

function normalizeQuarterTurns(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return ((Math.trunc(n) % 4) + 4) % 4;
}

export function EntryImages({
  entryId,
  entryDateYmd,
  images,
  photosDailyQuota,
  /** 日記草案プレビューの右欄など。lg 以上は 1 行の横スクロール。未指定は常にグリッド */
  galleryLayout = "default",
}: {
  entryId: string;
  entryDateYmd: string;
  images: Img[];
  photosDailyQuota?: { remaining: number; dailyLimit: number; resetAt: string };
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
  const [active, setActive] = useState<Img | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorErr, setEditorErr] = useState<string | null>(null);
  const [draftCaption, setDraftCaption] = useState("");
  const [draftRot, setDraftRot] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, { rotationQuarterTurns: number; caption: string }>>({});

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

  function mergedImage(img: Img): Img {
    const o = overrides[img.id];
    return o ? { ...img, rotationQuarterTurns: o.rotationQuarterTurns, caption: o.caption } : img;
  }

  function openEditor(img: Img) {
    const m = mergedImage(img);
    setEditorErr(null);
    setActive(m);
    setDraftCaption((m.caption ?? "").trim());
    setDraftRot(normalizeQuarterTurns(m.rotationQuarterTurns ?? 0));
  }

  async function saveEditor() {
    if (!active) return;
    setEditorBusy(true);
    setEditorErr(null);
    try {
      const res = await fetch(`/api/images/${encodeURIComponent(active.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rotationQuarterTurns: draftRot,
          caption: draftCaption,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEditorErr(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      const image = (data as unknown as { image?: { id?: string; rotationQuarterTurns?: number; caption?: string } }).image;
      const imageId = typeof image?.id === "string" && image.id.trim() ? image.id : null;
      if (image && imageId) {
        setOverrides((prev) => ({
          ...prev,
          [imageId]: {
            rotationQuarterTurns: normalizeQuarterTurns(image.rotationQuarterTurns ?? draftRot),
            caption: typeof image.caption === "string" ? image.caption : draftCaption.trim(),
          },
        }));
      } else if (active?.id) {
        setOverrides((prev) => ({
          ...prev,
          [active.id]: { rotationQuarterTurns: draftRot, caption: draftCaption.trim() },
        }));
      }
      setActive(null);
      router.refresh();
    } catch (e) {
      setEditorErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">写真・画像</h2>
        {photosDailyQuota ? (
          <PhotosDailyQuotaBadge
            remaining={photosDailyQuota.remaining}
            dailyLimit={photosDailyQuota.dailyLimit}
          />
        ) : null}
      </div>

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
            {images.map((img) => {
              const m = mergedImage(img);
              return (
              <div
                key={img.id}
                className={`relative overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-lg ${
                  asideGallery
                    ? "aspect-square max-lg:min-w-0 lg:aspect-square lg:h-20 lg:w-20 lg:max-w-none lg:shrink-0"
                    : "aspect-square"
                }`}
              >
                <button type="button" onClick={() => openEditor(m)} className="block h-full w-full cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${img.id}`}
                    alt=""
                    className="h-full w-full max-w-full object-cover"
                    style={{ transform: `rotate(${normalizeQuarterTurns(m.rotationQuarterTurns ?? 0) * 90}deg)` }}
                    sizes={
                      asideGallery
                        ? "(min-width: 1024px) 80px, (max-width: 1023px) 16vw"
                        : "(max-width: 639px) 30vw, (max-width: 1024px) 33vw, 320px"
                    }
                    loading="lazy"
                    decoding="async"
                  />
                </button>
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
              );
            })}
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

      <ResponsiveDialog
        open={active !== null}
        onClose={() => setActive(null)}
        labelledBy="entry-image-editor-title"
        dialogId="entry-image-editor-dialog"
        zClass="z-[90]"
        presentation="island"
      >
        {active ? (
          <div className="flex max-h-[85vh] flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800 md:pt-4">
              <h2 id="entry-image-editor-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                画像を編集
              </h2>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                閉じる
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-4 text-sm text-zinc-700 dark:text-zinc-300">
              {editorErr ? <p className="text-xs text-red-600 dark:text-red-400">{editorErr}</p> : null}

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={editorBusy}
                      onClick={() => setDraftRot((r) => (r + 3) % 4)}
                      aria-label="左に回転"
                      title="左に回転"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      <svg viewBox="-2 -2 28 28" className="h-5 w-5 translate-y-1" aria-hidden>
                        <path
                          d="M8 7H4V3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4 7a9 9 0 1 1 2.64 6.36"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={editorBusy}
                      onClick={() => setDraftRot((r) => (r + 1) % 4)}
                      aria-label="右に回転"
                      title="右に回転"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    >
                      <svg viewBox="-2 -2 28 28" className="h-5 w-5 translate-y-1" aria-hidden>
                        <path
                          d="M16 7h4V3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M20 7a9 9 0 1 0-2.64 6.36"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <a
                    href={`/api/images/${active.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-emerald-700 underline decoration-emerald-700/40 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    新しいタブで開く
                  </a>
                </div>

                <div className="flex max-h-[52vh] items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${active.id}`}
                    alt=""
                    className="max-h-[52vh] w-auto max-w-full select-none object-contain"
                    style={{ transform: `rotate(${draftRot * 90}deg)` }}
                    decoding="async"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300" htmlFor="entry-image-caption">
                  コメント
                </label>
                <textarea
                  id="entry-image-caption"
                  value={draftCaption}
                  onChange={(e) => setDraftCaption(e.target.value)}
                  rows={3}
                  maxLength={280}
                  placeholder="例: 夕方の散歩"
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500/20 placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500"
                  disabled={editorBusy}
                />
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{draftCaption.trim().length} / 280</p>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={editorBusy}
                  onClick={() => setActive(null)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={editorBusy}
                  onClick={() => void saveEditor()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  {editorBusy ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div />
        )}
      </ResponsiveDialog>
    </section>
  );
}
