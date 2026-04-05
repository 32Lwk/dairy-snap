/**
 * オンボーディング（チャット形式）の表示文言。
 * 文言の変更は基本的にこのファイルだけで行えます。
 */

import { summarizeInterestPicksForChatLog } from "@/lib/interest-taxonomy";
import { labelForOccupationRole } from "@/lib/occupation-role";

/** アシスタント吹き出し（初期表示） */
export const ONBOARDING_ASSISTANT_WELCOME =
  "はじめまして。日記アプリでの振り返りが少し楽になるよう、プロフィールを伺います。すべてスキップもできます。まず、お呼びする名前やニックネームはありますか？（任意）";

export const ONBOARDING_ASSISTANT_AFTER_NICKNAME =
  "ありがとうございます。生年月日を教えてください。星座と満年齢は自動で表示されます（任意・スキップ可）。";

export const ONBOARDING_ASSISTANT_AFTER_BIRTH = "性別を選んでください（任意・スキップ可）。";

export const ONBOARDING_ASSISTANT_AFTER_GENDER =
  "血液型を選んでください（任意）。";

/** 血液型のあと → 職業・暮らしの質問へ */
export const ONBOARDING_ASSISTANT_AFTER_BLOOD =
  "いまの立場に近いものを、ひとつ選んでください（任意）。このあと、選んだ内容に合わせて質問が続きます。";

export const ONBOARDING_ASSISTANT_AFTER_WORK_LIFE = "MBTI のタイプを選んでください（任意）。";

export const ONBOARDING_ASSISTANT_AFTER_MBTI_FOR_LOVE =
  "恋愛キャラタイプ（別枠の16分類）を選んでください（任意）。";

export const ONBOARDING_ASSISTANT_AFTER_LOVE =
  "趣味・関心に近いものを選んでください。大分類→小分類→詳細タグのあと、音楽・映像・ゲーム・スポーツなどでは「テーマ・見方」と「作品・タイトル例」などの下段チップでさらに細かく選べます（複数選択可・任意）。";

export const ONBOARDING_ASSISTANT_AFTER_INTERESTS =
  "日記や振り返りのトーンに使います。AI との関わり方（呼び方・トーンなど）を選べます。伝えておきたいことがあればメモにも書けます（すべて任意・スキップ可）。";

export const ONBOARDING_ASSISTANT_CONFIRM_SAVE = "入力内容を保存して、はじめにページを完了しますか？";

/** 入力欄まわり */
export const ONBOARDING_UI = {
  nicknamePlaceholder: "ニックネーム（任意）",
  occupationNotePlaceholder: "職種・学部・学年など（任意）",
  studentLifePlaceholder:
    "学校名・所在地・通学時間・居住地・時間割のメモなど（学生の方・任意）",
  educationPlaceholder: "出身地・学歴・職歴・アルバイトの経験など（任意）",
  preferencesPlaceholder: "メモ（任意）",
  mbtiHintBeforeLink: "まだタイプが分からないときは、",
  mbtiHintAfterLink: "で確認できます。",
  mbtiHintLinkLabel: "無料性格診断（16Personalities）",
  loveHintLinkLabel: "恋愛キャラ診断（lovecharacter64.jp）",
  openFormLink: "一覧フォームで入力する",
  zodiacPrefix: "星座:",
  zodiacSuffixAuto: "（自動）",
  agePrefix: "満年齢:",
  ageSuffixAuto: "歳（自動）",
} as const;

export const ONBOARDING_GENDER_OPTIONS = [
  { value: "", label: "選ばない" },
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "nonbinary", label: "ノンバイナリー" },
  { value: "no_answer", label: "答えたくない" },
  { value: "other", label: "その他" },
] as const;

/** ログに出すユーザー側の要約文 */
export const onboardingUserLog = {
  nickname: (trimmed: string) => (trimmed ? `ニックネーム: ${trimmed}` : "（未入力）"),
  birth: (ymd: string, zodiacLabel: string | null, age: number | null) =>
    ymd
      ? `生年月日: ${ymd}${zodiacLabel ? `（${zodiacLabel}）` : ""}${age != null ? `・満${age}歳` : ""}`
      : "（スキップ）",
  gender: (code: string) =>
    code
      ? `性別: ${ONBOARDING_GENDER_OPTIONS.find((o) => o.value === code)?.label ?? code}`
      : "（スキップ）",
  blood: (v: string) => (v ? `血液型: ${v}` : "（スキップ）"),
  interests: (picks: string[]) => summarizeInterestPicksForChatLog(picks),
  workLife: (role: string, note: string, student: string, history: string) => {
    const parts: string[] = [];
    if (role) parts.push(labelForOccupationRole(role));
    if (note.trim()) parts.push("職種など補足あり");
    if (student.trim()) parts.push("学校・通学・居住メモあり");
    if (history.trim()) parts.push("出身・経歴メモあり");
    if (parts.length === 0) return "（スキップ）";
    return `暮らし・職業: ${parts.join("、")}`;
  },
  /** 選択式フロー完了時のユーザー吹き出し（短文） */
  workLifeFromComposed: (
    role: string,
    composed: { occupationNote: string; studentLifeNotes: string; education: string },
  ) => {
    const bits: string[] = [];
    if (role) bits.push(labelForOccupationRole(role));
    if (composed.studentLifeNotes.trim()) bits.push("通学・学校まわり: 選択済み");
    if (composed.occupationNote.trim()) bits.push("仕事の内容: 選択済み");
    if (composed.education.trim()) bits.push("出身・経歴: 選択済み");
    if (bits.length === 0) return "（スキップ）";
    return `暮らし・職業: ${bits.join("、")}`;
  },
  agentPersonaAndMemo: (preferences: string) =>
    preferences.trim() ? "メモを入力しました" : "（メモなし）",
} as const;
