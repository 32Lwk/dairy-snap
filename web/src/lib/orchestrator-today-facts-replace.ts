/**
 * オーケストレーター system 文字列内の「今日の参照事実」ブロックを差し替える（ツールラウンド後のマージ用）。
 */
export function replaceOrchestratorTodayFactsSection(full: string, newTodaySection: string): string {
  const start = full.indexOf("## 今日の参照事実（structured）");
  if (start < 0) return full;
  const marker = "\n\n## 対象日\n";
  const end = full.indexOf(marker, start);
  if (end < 0) return full;
  return full.slice(0, start) + newTodaySection + full.slice(end);
}
