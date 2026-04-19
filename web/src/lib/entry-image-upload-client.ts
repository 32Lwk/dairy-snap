import imageCompression from "browser-image-compression";

export async function supportsAvifEncode(): Promise<boolean> {
  if (typeof createImageBitmap === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  canvas.getContext("2d")?.fillRect(0, 0, 1, 1);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/avif"));
  return Boolean(blob && blob.size > 0);
}

export async function compressImageForDailyEntry(file: File): Promise<File> {
  const avifOk = await supportsAvifEncode();
  return imageCompression(file, {
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    initialQuality: 0.85,
    fileType: avifOk ? "image/avif" : "image/webp",
  });
}

export async function uploadEntryImage(entryId: string, file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo");
  const res = await fetch(`/api/entries/${entryId}/images`, { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "アップロードに失敗しました" };
  }
  return { ok: true };
}
