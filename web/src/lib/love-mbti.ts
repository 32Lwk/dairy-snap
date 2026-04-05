/**
 * 恋愛キャラ64 / Love Character 系の16タイプ（L/F × C/A × R/P × O/E）
 * 相性・特徴などは表示・プロンプト用に別管理（値はコードのみ保存）
 */

export const LOVE_MBTI_16 = [
  "LCRO",
  "LCRE",
  "LCPO",
  "LCPE",
  "LARO",
  "LARE",
  "LAPO",
  "LAPE",
  "FCRO",
  "FCRE",
  "FCPO",
  "FCPE",
  "FARO",
  "FARE",
  "FAPO",
  "FAPE",
] as const;

export type LoveMbtiType = (typeof LOVE_MBTI_16)[number];

/** 診断サイト（恋愛キャラ16） */
export const LOVE_MBTI_TEST_URL_JA = "https://lovecharacter64.jp";

/** 4指標の説明（UI・ヘルプ用） */
export const LOVE_MBTI_AXES_JA = [
  "Lead / Follow：自分のペースで進めたいか、相手に合わせたいか",
  "Cuddly / Accept：甘えたいか、甘えられたいか",
  "Realistic / Passionate：現実的な恋愛か、情熱的な恋愛か",
  "Optimistic / Earnest：自由で楽観的か、真面目で誠実か",
] as const;

export const LOVE_MBTI_NICKNAME_JA: Record<LoveMbtiType, string> = {
  LCRO: "ボス猫",
  LCRE: "隠れベイビー",
  LCPO: "主役体質",
  LCPE: "ツンデレヤンキー",
  LARO: "憧れの先輩",
  LARE: "カリスマバランサー",
  LAPO: "パーフェクトカメレオン",
  LAPE: "キャプテンライオン",
  FCRO: "ロマンスマジシャン",
  FCRE: "ちゃっかりうさぎ",
  FCPO: "恋愛モンスター",
  FCPE: "忠犬ハチ公",
  FARO: "不思議生命体",
  FARE: "敏腕マネージャー",
  FAPO: "デビル天使",
  FAPE: "最後の恋人",
};

export type LoveMbtiDetail = {
  code: LoveMbtiType;
  traitJa: string;
  loveTendencyJa: string;
  compatibleGoodJa: string;
  compatibleBadJa: string;
};

/** 特徴・恋愛傾向・相性（コードとは別オブジェクトで管理） */
export const LOVE_MBTI_DETAILS: Record<LoveMbtiType, Omit<LoveMbtiDetail, "code">> = {
  LCRO: {
    traitJa: "自分のペースを崩さず、現実的に恋愛を進める",
    loveTendencyJa: "安定感を重視。主導権を握りつつも安心できる関係を築く",
    compatibleGoodJa: "FAPE（最後の恋人）/ FCRE（ちゃっかりうさぎ）/ FCPE（忠犬ハチ公）",
    compatibleBadJa: "ボス猫（LCRO）",
  },
  LCRE: {
    traitJa: "誠実に見えて実は強い甘えたい願望を持つ",
    loveTendencyJa: "尽くしつつ依存的になることも。守られると輝く",
    compatibleGoodJa: "敏腕マネージャー（FARE）/ 隠れベイビー（LCRE）/ 忠犬ハチ公（FCPE）",
    compatibleBadJa: "パーフェクトカメレオン（LAPO）",
  },
  LCPO: {
    traitJa: "常に恋愛の中心に立ちたい主役気質",
    loveTendencyJa: "情熱的でストレートな愛情表現。刺激的な恋を求める",
    compatibleGoodJa: "デビル天使（FAPO）/ 敏腕マネージャー（FARE）/ キャプテンライオン（LAPE）",
    compatibleBadJa: "ロマンスマジシャン（FCRO）",
  },
  LCPE: {
    traitJa: "不器用に見えて、誠実に愛を伝えるツンデレ",
    loveTendencyJa: "強引さと優しさのギャップが魅力。真剣な関係を築く",
    compatibleGoodJa: "カリスマバランサー（LARE）/ ツンデレヤンキー（LCPE）",
    compatibleBadJa: "恋愛モンスター（FCPO）",
  },
  LARO: {
    traitJa: "頼れる存在として慕われるカリスマ性あり",
    loveTendencyJa: "冷静に見えて内心情熱的。リードして導く恋愛スタイル",
    compatibleGoodJa: "忠犬ハチ公（FCPE）/ デビル天使（FAPO）/ 最後の恋人（FAPE）",
    compatibleBadJa: "憧れの先輩（LARO）",
  },
  LARE: {
    traitJa: "調和を大切にし、リードしながら相手を尊重",
    loveTendencyJa: "誠実かつ落ち着いた対応。安心感を与える",
    compatibleGoodJa: "ちゃっかりうさぎ（FCRE）/ ツンデレヤンキー（LCPE）/ 恋愛モンスター（FCPO）",
    compatibleBadJa: "不思議生命体（FARO）",
  },
  LAPO: {
    traitJa: "状況に応じて柔軟に立ち回れる万能型",
    loveTendencyJa: "相手に合わせながらも自分の個性を活かせる",
    compatibleGoodJa: "恋愛モンスター（FCPO）/ 最後の恋人（FAPE）/ パーフェクトカメレオン（LAPO）",
    compatibleBadJa: "隠れベイビー（LCRE）",
  },
  LAPE: {
    traitJa: "堂々としたリーダーシップで恋愛を引っ張る",
    loveTendencyJa: "頼りがいがあり、守ってあげたい意識が強い",
    compatibleGoodJa: "ロマンスマジシャン（FCRO）/ キャプテンライオン（LAPE）/ 主役体質（LCPO）",
    compatibleBadJa: "敏腕マネージャー（FARE）",
  },
  FCRO: {
    traitJa: "相手をドキドキさせる恋愛の演出家",
    loveTendencyJa: "情熱的でロマンチックな関係を好む",
    compatibleGoodJa: "キャプテンライオン（LAPE）/ ロマンスマジシャン（FCRO）/ 敏腕マネージャー（FARE）",
    compatibleBadJa: "主役体質（LCPO）",
  },
  FCRE: {
    traitJa: "愛され上手で計算高い一面も",
    loveTendencyJa: "可愛がられながらも主導権を握ることがある",
    compatibleGoodJa: "カリスマバランサー（LARE）/ ボス猫（LCRO）/ ちゃっかりうさぎ（FCRE）",
    compatibleBadJa: "デビル天使（FAPO）",
  },
  FCPO: {
    traitJa: "恋愛そのものを楽しみ尽くす存在",
    loveTendencyJa: "情熱的で波乱含み。恋をドラマのように楽しむ",
    compatibleGoodJa: "パーフェクトカメレオン（LAPO）/ 不思議生命体（FARO）/ カリスマバランサー（LARE）",
    compatibleBadJa: "ツンデレヤンキー（LCPE）",
  },
  FCPE: {
    traitJa: "一途で誠実。裏切らない安心感を持つ",
    loveTendencyJa: "尽くし型で、相手を大切に守り抜く",
    compatibleGoodJa: "憧れの先輩（LARO）/ 隠れベイビー（LCRE）/ ボス猫（LCRO）",
    compatibleBadJa: "忠犬ハチ公（FCPE）",
  },
  FARO: {
    traitJa: "独自の世界観を持ち、ミステリアスな魅力あり",
    loveTendencyJa: "型にはまらず自由な恋愛を展開する",
    compatibleGoodJa: "ツンデレヤンキー（LCPE）/ 恋愛モンスター（FCPO）/ 不思議生命体（FARO）",
    compatibleBadJa: "カリスマバランサー（LARE）",
  },
  FARE: {
    traitJa: "現実的で計画的。恋愛を堅実に進める",
    loveTendencyJa: "誠実で信頼感を重視。安定した関係を築く",
    compatibleGoodJa: "隠れベイビー（LCRE）/ 主役体質（LCPO）/ ロマンスマジシャン（FCRO）",
    compatibleBadJa: "キャプテンライオン（LAPE）",
  },
  FAPO: {
    traitJa: "小悪魔的で魅力的、惹きつける力が強い",
    loveTendencyJa: "愛情深さと自由さを併せ持つ。恋を翻弄することも",
    compatibleGoodJa: "主役体質（LCPO）/ デビル天使（FAPO）/ 憧れの先輩（LARO）",
    compatibleBadJa: "ちゃっかりうさぎ（FCRE）",
  },
  FAPE: {
    traitJa: "一途に愛を注ぎ、生涯のパートナーを求める",
    loveTendencyJa: "真剣で誠実。理想の相手に出会うと強く結びつく",
    compatibleGoodJa: "ボス猫（LCRO）/ パーフェクトカメレオン（LAPO）/ 憧れの先輩（LARO）",
    compatibleBadJa: "最後の恋人（FAPE）",
  },
};

export function isLoveMbtiType(value: string): value is LoveMbtiType {
  return (LOVE_MBTI_16 as readonly string[]).includes(value);
}

export function loveMbtiDisplayJa(code: LoveMbtiType): string {
  return `${code}（${LOVE_MBTI_NICKNAME_JA[code]}）`;
}

export function getLoveMbtiDetail(code: LoveMbtiType): LoveMbtiDetail {
  const d = LOVE_MBTI_DETAILS[code];
  return { code, ...d };
}

/**
 * チャットプロンプト用: **登録タイプ1件分**の特徴・傾向・相性のみ。
 * 全16タイプの定義やフレームワーク全文は含めない。
 */
export function loveMbtiUserPromptSubLines(code: LoveMbtiType): string[] {
  const d = LOVE_MBTI_DETAILS[code];
  return [
    `  - 特徴: ${d.traitJa}`,
    `  - 恋愛傾向: ${d.loveTendencyJa}`,
    `  - 相性が合いやすい: ${d.compatibleGoodJa}`,
    `  - 相性が組みにくい: ${d.compatibleBadJa}`,
  ];
}
