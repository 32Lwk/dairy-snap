const MARKER = "## 今日のまとめ（AI）";

/** AI日記セクションを本文へ反映（既存セクションがあれば置換） */
export function mergeAiDiarySection(body: string, draftMarkdown: string): string {
  const draft = draftMarkdown.trim();
  if (!draft) return body;

  const start = body.indexOf(MARKER);
  if (start === -1) {
    const base = body.trimEnd();
    return base ? `${base}\n\n${draft}` : draft;
  }

  const afterMarker = start + MARKER.length;
  const rest = body.slice(afterMarker);
  const nextHeading = rest.search(/\n## /);
  const end =
    nextHeading === -1 ? body.length : start + afterMarker + nextHeading;
  const before = body.slice(0, start).trimEnd();
  const after = end >= body.length ? "" : body.slice(end).trimStart();
  const merged = [before, draft, after].filter(Boolean).join("\n\n");
  return merged;
}
