/** DB の ChatMessage.model に入れるプレースホルダ（開口生成中） */
export const OPENING_PENDING_MODEL = "__opening_pending__";

export function isOpeningPendingModel(model: string | null | undefined): boolean {
  return model === OPENING_PENDING_MODEL;
}
