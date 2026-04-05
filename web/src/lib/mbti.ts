/** 16パーソナリティタイプ（英字4文字） */
export const MBTI_16 = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const;

export type MbtiType = (typeof MBTI_16)[number];

/** 16Personalities 日本語のタイプ名（職業・役割ラベル） */
export const MBTI_ARCHETYPE_JA: Record<MbtiType, string> = {
  INTJ: "建築家",
  INTP: "論理学者",
  ENTJ: "指揮官",
  ENTP: "討論者",
  INFJ: "提唱者",
  INFP: "仲介者",
  ENFJ: "主人公",
  ENFP: "運動家",
  ISTJ: "管理者",
  ISFJ: "擁護者",
  ESTJ: "幹部",
  ESFJ: "領事",
  ISTP: "巨匠",
  ISFP: "冒険家",
  ESTP: "起業家",
  ESFP: "エンターテイナー",
};

/** 無料診断（16Personalities 日本語） */
export const MBTI_TEST_URL_JA = "https://www.16personalities.com/ja/性格診断テスト";

/** プロフィール用の4軸の短い説明（16タイプの古典的な読み方） */
export const MBTI_AXES_JA = [
  "E / I：外向的にエネルギーを得るか、内向的に蓄えるか",
  "S / N：五感の事実・経験重視か、可能性・イメージ重視か",
  "T / F：論理・一貫性優先か、価値・人間関係の調和優先か",
  "J / P：計画・決着を好むか、柔軟・探索を好むか",
] as const;

export function isMbtiType(value: string): value is MbtiType {
  return (MBTI_16 as readonly string[]).includes(value);
}

export function mbtiDisplayJa(code: MbtiType): string {
  return `${code}（${MBTI_ARCHETYPE_JA[code]}）`;
}
