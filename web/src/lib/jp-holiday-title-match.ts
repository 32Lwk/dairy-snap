/**
 * カレンダー終日タイトルと国立祝日名の一致（振替・括弧付きの先頭一致を含む）
 */
export function nationalHolidayTitleMatches(titleRaw: string, holidayName: string): boolean {
  const t = (titleRaw ?? "").trim();
  const h = (holidayName ?? "").trim();
  if (!t || !h) return false;
  if (t === h) return true;
  if (t.startsWith(`${h}（`) || t.startsWith(`${h}(`)) return true;
  if (t.startsWith(`${h}・`)) return true;
  return false;
}
