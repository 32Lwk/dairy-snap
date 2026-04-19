/** 1エントリあたりの画像枚数・合計サイズ（アップロード API と Google 取り込みで共通） */
export const MAX_IMAGES_PER_ENTRY = 10;
export const MAX_TOTAL_IMAGE_BYTES_PER_ENTRY = 50 * 1024 * 1024;

export function extFromMime(mime: string): string {
  if (mime === "image/avif") return "avif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  return "bin";
}
