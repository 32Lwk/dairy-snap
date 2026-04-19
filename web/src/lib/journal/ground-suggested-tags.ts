/**
 * 指定した根拠テキスト（通常はタイトル案＋草案本文）に文字列として現れないタグを落とす。
 * 会話ログ全体を根拠にすると脇話・別日の話題までタグ化されるため、日記プレビューでは本文側のコーパスに限定する。
 * 並びは日本語ロケールでソートし、同じ入力では同じ順になるようにする。
 */
export function filterGroundedSuggestedTagsCsv(
  tagsCsv: string,
  /** タグが現れてよい根拠となるテキスト（例: タイトル案と draft を連結） */
  transcript: string,
  draftMarkdown?: string,
): string {
  const parts = tagsCsv
    .split(/[,，、]/)
    .map((s) => s.normalize("NFKC").trim())
    .filter((s) => s.length > 0 && s.length <= 48);
  const tHay = transcript.normalize("NFKC");
  const tCollapsed = tHay.replace(/\s+/g, "");
  const dHay = (draftMarkdown ?? "").normalize("NFKC");
  const dCollapsed = dHay.replace(/\s+/g, "");
  const seen = new Set<string>();
  const out: string[] = [];

  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    const inTranscript = tagAppearsGrounded(p, tHay, tCollapsed);
    const inDraft = dHay.length > 0 && tagAppearsGrounded(p, dHay, dCollapsed);
    if (!inTranscript && !inDraft) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 12) break;
  }
  out.sort((a, b) => a.localeCompare(b, "ja"));
  return out.join("、");
}

function tagAppearsGrounded(tag: string, hay: string, collapsedHay: string): boolean {
  if (hay.includes(tag)) return true;
  const collapsedTag = tag.replace(/\s+/g, "");
  if (collapsedTag.length >= 2 && collapsedHay.includes(collapsedTag)) return true;
  if (/^[a-zA-Z0-9 .+\-]+$/.test(tag)) {
    return hay.toLowerCase().includes(tag.toLowerCase());
  }
  return false;
}
