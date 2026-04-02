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

export function isMbtiType(value: string): value is MbtiType {
  return (MBTI_16 as readonly string[]).includes(value);
}
