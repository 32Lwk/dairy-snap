/**
 * 各「小分類」に紐づく参照用 URL（Wikipedia は最終手段。映像系は専門メディア・業界団体を優先）。
 * 詳細タグ・works に個別 URL が無いときの既定フォールバックに使う。
 */

import { INTEREST_CATEGORIES, type InterestSub } from "@/lib/interest-taxonomy";

function wikiJa(title: string): string {
  const t = title.replace(/\s+/g, "_");
  return `https://ja.wikipedia.org/wiki/${encodeURIComponent(t)}`;
}

/** 「A・B」形式のラベルは Wikipedia 記事名が一致しにくいので先頭節のみで検索する */
function wikiJaFromSubLabel(label: string): string {
  const head = (label.split("・")[0] ?? label).trim();
  return wikiJa(head || label);
}

/** 小分類ラベルだけでは記事がズレるもの */
const PORTAL_URL_BY_SUB_ID: Partial<Record<string, string>> = {
  "media:anime": "https://animeanime.jp/",
  "media:movie": "https://eiga.com/",
  "media:manga": "https://natalie.mu/comic",
  "media:lightnovel": "https://ln-news.com/",
  "media:drama": "https://thetv.jp/drama/",
  "media:variety": "https://www.oricon.co.jp/news/entertainment/",
  "media:other": "https://natalie.mu/eiga/",
  "media:youtube": "https://www.youtube.com/",
  "media:vtuber": "https://kai-you.net/",
  "music:anime": "https://www.lisani.jp/",
  "music:edm": wikiJa("エレクトロニック・ダンス・ミュージック"),
  "music:stage": wikiJa("ミュージカル"),
  "sports:basketball": wikiJa("バスケットボール"),
  "sports:volleyball": wikiJa("バレーボール"),
  "sports:table_tennis": wikiJa("卓球"),
  "sports:skate": wikiJa("スケート"),
  "games:console": wikiJa("テレビゲーム"),
  "games:visual_novel": wikiJa("アドベンチャーゲーム"),
  "games:tcg": wikiJa("トレーディングカードゲーム"),
  "games:esports": wikiJa("eスポーツ"),
  "outdoor:hiking": wikiJa("登山"),
  "outdoor:cycling": wikiJa("サイクリング"),
  "food:wine": wikiJa("アルコール飲料"),
  "food:cafe": wikiJa("カフェ"),
  "learn:programming": wikiJa("プログラミング"),
  "learn:law": wikiJa("法学"),
  "tech:smartphone": wikiJa("スマートフォン"),
  "tech:pc_build": wikiJa("パソコン"),
  "fashion:beauty": wikiJa("化粧品"),
  "life:minimal": wikiJa("ミニマリズム"),
  /** ラベル先頭節だけでは記事が無い／ズレる小分類 */
  "games:speedrun": wikiJa("リアルタイムアタック"),
  "games:fighting": wikiJa("対戦型格闘ゲーム"),
  "pets:aquarium": wikiJa("水族館"),
  "outdoor:motorcycle": wikiJa("オートバイ"),
};

const OTHER_FALLBACK_TITLE_BY_CATEGORY_ID: Record<string, string> = {
  music: "音楽",
  sports: "スポーツ",
  media: "エンターテインメント",
  games: "ゲーム",
  creative: "創作",
  outdoor: "アウトドア",
  food: "料理",
  learn: "教育",
  tech: "科学技術",
  fashion: "ファッション",
  pets: "ペット",
  life: "生活",
};

function portalForSub(sub: InterestSub, categoryId: string): string {
  const o = PORTAL_URL_BY_SUB_ID[sub.id];
  if (o) return o;
  if (sub.label === "その他") {
    const t = OTHER_FALLBACK_TITLE_BY_CATEGORY_ID[categoryId] ?? categoryId;
    return wikiJa(t);
  }
  return wikiJaFromSubLabel(sub.label);
}

export function buildInterestSubPortalUrlMap(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const cat of INTEREST_CATEGORIES) {
    for (const sub of cat.subs) {
      m[sub.id] = portalForSub(sub, cat.id);
    }
  }
  return m;
}

export const INTEREST_SUB_PORTAL_URL_BY_ID: Record<string, string> = buildInterestSubPortalUrlMap();
