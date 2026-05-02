/**
 * 「薄い日」判定（開口・スレッドヒント用）。ロジックは1箇所に集約。
 */

export type SparseScheduleInput = {
  /** Google カレンダー連携できイベント一覧を取れたか */
  calendarLinked: boolean;
  /** その日のカレンダー件数（連携不可時は 0 扱い推奨） */
  calendarEventCount: number;
  /** 開口用の時間割「この後の講義」ブロックが付いたか */
  hasTimetableLecturesToday: boolean;
};

/**
 * - カレンダー未連携も「予定が見えない」＝薄い日に含める
 * - イベント0 かつ 時間割アンカーなし
 */
export function isSparseSchedule(input: SparseScheduleInput): boolean {
  const events = input.calendarLinked ? input.calendarEventCount : 0;
  return events === 0 && !input.hasTimetableLecturesToday;
}

export function hasInterestProfileSignals(profile: {
  interestPicks?: string[] | undefined;
  preferences?: string | undefined;
  hobbies?: string | undefined;
  interests?: string | undefined;
}): boolean {
  const picks = profile.interestPicks?.length ?? 0;
  if (picks > 0) return true;
  if ((profile.preferences ?? "").trim().length > 0) return true;
  if ((profile.hobbies ?? "").trim().length > 0) return true;
  if ((profile.interests ?? "").trim().length > 0) return true;
  return false;
}
