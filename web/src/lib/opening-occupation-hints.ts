/**
 * 薄い日の開口・スレッド用：職業別の観点ヒント（英語・system 向け）
 */

const SPARSE_DAY_OCC_HINTS_EN: Record<string, string> = {
  "": "If the day looks light on fixed plans, invite reflection on rest, errands, side projects, or whatever filled the time — stay neutral.",
  student:
    "If the day looks light on fixed plans, avoid forcing 授業/講義 when no timetable anchor exists; lean on hobbies, clubs, part-time, or rest.",
  company:
    "If the day looks light on fixed plans, light touches on work rhythm, commute, evening wind-down, or personal errands work well — stay tentative.",
  public_sector:
    "If the day looks light on fixed plans, keep work assumptions soft; weekend or off-day framing may fit — invite how the day actually went.",
  self_employed:
    "If the day looks light on fixed plans, client work vs admin vs creative time is often ambiguous — ask gently rather than asserting.",
  homemaker:
    "If the day looks light on fixed plans, household rhythm, family, or local errands are natural hooks — avoid implying a packed schedule.",
  job_seeking:
    "If the day looks light on fixed plans, job search intensity can vary — check in softly without assuming interviews or submissions.",
  other:
    "If the day looks light on fixed plans, stay open-ended about how time was spent — hobbies, rest, or one-off tasks.",
};

export function sparseDayOccupationHintEn(occupationRole: string | undefined): string {
  const key = (occupationRole ?? "").trim();
  return SPARSE_DAY_OCC_HINTS_EN[key] ?? SPARSE_DAY_OCC_HINTS_EN[""]!;
}
