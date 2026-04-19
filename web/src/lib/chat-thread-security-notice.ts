/** Reads `securityNoticeJa` written by async security review (medium severity). */
export function readSecurityNoticeJaFromConversationNotes(notes: unknown): string | undefined {
  if (!notes || typeof notes !== "object") return undefined;
  const raw = (notes as Record<string, unknown>).securityNoticeJa;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}
