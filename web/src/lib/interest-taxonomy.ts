/**
 * 趣味・関心の階層（大分類 → 小分類）
 * 保存形式: `categoryId:subId` を `interestPicks[]` に格納
 */

export type InterestSub = { id: string; label: string };

export type InterestCategory = {
  id: string;
  label: string;
  subs: InterestSub[];
};

export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    id: "music",
    label: "音楽",
    subs: [
      { id: "music:jpop", label: "J-POP" },
      { id: "music:kpop", label: "K-POP" },
      { id: "music:rock", label: "ロック" },
      { id: "music:classical", label: "クラシック" },
      { id: "music:jazz", label: "ジャズ" },
      { id: "music:anime", label: "アニソン" },
      { id: "music:idol", label: "アイドル" },
      { id: "music:vocaloid", label: "ボカロ" },
      { id: "music:hiphop", label: "ヒップホップ" },
      { id: "music:other", label: "その他" },
    ],
  },
  {
    id: "sports",
    label: "スポーツ",
    subs: [
      { id: "sports:soccer", label: "サッカー" },
      { id: "sports:baseball", label: "野球" },
      { id: "sports:tennis", label: "テニス" },
      { id: "sports:volleyball", label: "バレーボール" },
      { id: "sports:basketball", label: "バスケ" },
      { id: "sports:cricket", label: "クリケット" },
      { id: "sports:running", label: "ランニング" },
      { id: "sports:swimming", label: "水泳" },
      { id: "sports:martial", label: "格闘技" },
      { id: "sports:other", label: "その他" },
    ],
  },
  {
    id: "media",
    label: "映像・エンタメ",
    subs: [
      { id: "media:anime", label: "アニメ" },
      { id: "media:movie", label: "映画" },
      { id: "media:drama", label: "ドラマ" },
      { id: "media:youtube", label: "YouTube" },
      { id: "media:vtuber", label: "VTuber" },
      { id: "media:variety", label: "バラエティ" },
      { id: "media:other", label: "その他" },
    ],
  },
  {
    id: "games",
    label: "ゲーム",
    subs: [
      { id: "games:console", label: "家庭用ゲーム" },
      { id: "games:pc", label: "PCゲーム" },
      { id: "games:mobile", label: "スマホゲーム" },
      { id: "games:board", label: "ボードゲーム" },
      { id: "games:tcg", label: "TCG" },
      { id: "games:esports", label: "eスポーツ" },
      { id: "games:other", label: "その他" },
    ],
  },
  {
    id: "creative",
    label: "創作・表現",
    subs: [
      { id: "creative:art", label: "美術" },
      { id: "creative:photo", label: "写真" },
      { id: "creative:writing", label: "小説・執筆" },
      { id: "creative:music_make", label: "作曲・演奏" },
      { id: "creative:craft", label: "ハンドメイド" },
      { id: "creative:other", label: "その他" },
    ],
  },
  {
    id: "outdoor",
    label: "アウトドア・旅行",
    subs: [
      { id: "outdoor:hiking", label: "登山・ハイキング" },
      { id: "outdoor:camp", label: "キャンプ" },
      { id: "outdoor:travel", label: "旅行" },
      { id: "outdoor:fishing", label: "釣り" },
      { id: "outdoor:cycling", label: "サイクリング" },
      { id: "outdoor:other", label: "その他" },
    ],
  },
  {
    id: "food",
    label: "グルメ",
    subs: [
      { id: "food:cooking", label: "料理" },
      { id: "food:cafe", label: "カフェ巡り" },
      { id: "food:sweets", label: "スイーツ" },
      { id: "food:wine", label: "お酒" },
      { id: "food:other", label: "その他" },
    ],
  },
  {
    id: "learn",
    label: "学び・教養",
    subs: [
      { id: "learn:science", label: "科学" },
      { id: "learn:history", label: "歴史" },
      { id: "learn:language", label: "語学" },
      { id: "learn:programming", label: "プログラミング" },
      { id: "learn:other", label: "その他" },
    ],
  },
];

export function labelForInterestPick(pickId: string): string | null {
  for (const c of INTEREST_CATEGORIES) {
    const hit = c.subs.find((s) => s.id === pickId);
    if (hit) return `${c.label} › ${hit.label}`;
  }
  return null;
}

export function formatInterestPicksForPrompt(picks: string[] | undefined): string {
  if (!picks?.length) return "";
  const lines = picks
    .map((id) => labelForInterestPick(id) ?? id)
    .filter(Boolean);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "";
}
