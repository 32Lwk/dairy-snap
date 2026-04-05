import { MEDIA_ANIME_FINES } from "./interest-taxonomy-media-anime";
import {
  MEDIA_DRAMA_FINES,
  MEDIA_LIGHTNOVEL_FINES,
  MEDIA_MANGA_FINES,
  MEDIA_MOVIE_FINES,
  MEDIA_OTHER_FINES,
  MEDIA_VARIETY_FINES,
  MEDIA_VTUBER_FINES,
  MEDIA_YOUTUBE_FINES,
} from "./interest-taxonomy-fines-media";
import {
  GAMES_BOARD_FINES,
  GAMES_CONSOLE_FINES,
  GAMES_ESPORTS_FINES,
  GAMES_FIGHTING_FINES,
  GAMES_HORROR_FINES,
  GAMES_MOBILE_FINES,
  GAMES_OTHER_FINES,
  GAMES_PC_FINES,
  GAMES_SPEEDRUN_FINES,
  GAMES_TCG_FINES,
  GAMES_VN_FINES,
} from "./interest-taxonomy-fines-games";
import {
  SPORTS_BADMINTON_FINES,
  SPORTS_BASEBALL_FINES,
  SPORTS_BASKETBALL_FINES,
  SPORTS_CRICKET_FINES,
  SPORTS_GYMNASTICS_FINES,
  SPORTS_MARTIAL_FINES,
  SPORTS_MOTOR_FINES,
  SPORTS_OTHER_FINES,
  SPORTS_RUGBY_FINES,
  SPORTS_RUNNING_FINES,
  SPORTS_SKATE_FINES,
  SPORTS_SOCCER_FINES,
  SPORTS_SUMO_FINES,
  SPORTS_SURF_FINES,
  SPORTS_SWIMMING_FINES,
  SPORTS_TABLE_TENNIS_FINES,
  SPORTS_TENNIS_FINES,
  SPORTS_VOLLEYBALL_FINES,
} from "./interest-taxonomy-fines-sports";
import {
  MUSIC_ANIME_SONG_FINES,
  MUSIC_CLASSICAL_FINES,
  MUSIC_CITYPOP_FINES,
  MUSIC_EDM_FINES,
  MUSIC_HIPHOP_FINES,
  MUSIC_IDOL_FINES,
  MUSIC_JAZZ_FINES,
  MUSIC_JPOP_FINES,
  MUSIC_KPOP_FINES,
  MUSIC_OTHER_FINES,
  MUSIC_REGGAE_FINES,
  MUSIC_ROCK_FINES,
  MUSIC_STAGE_FINES,
  MUSIC_VOCALOID_FINES,
} from "./interest-taxonomy-fines-music";

/**
 * 趣味・関心の階層（大分類 → 小分類 → 詳細タグ）
 * 詳細ID: `subId:suffix` ／ 小分類スコープ自由入力 `subId:user:encodeURIComponent(text)` ／ 全体自由入力 `interestFree:...`
 */

/** 小分類に紐づく詳細自由入力（`music:jazz:user:...`） */
export const INTEREST_USER_FINE_INFIX = ":user:";

export type InterestFine = {
  id: string;
  label: string;
  /** 詳細タグの下のさらに細かい分類（例: アニメのテーマ別） */
  micro?: InterestFine[];
  /** 代表的な作品チップ（親詳細タグと同じ枠で選ぶ） */
  works?: InterestFine[];
};

export type InterestSub = {
  id: string;
  label: string;
  /** 省略時は defaultFinesForSub で共通3種を付与。配列を指定するとその内容（歌手名など）を使用 */
  fine?: InterestFine[];
};

export type InterestCategory = {
  id: string;
  label: string;
  subs: InterestSub[];
};

export const INTEREST_FREE_PREFIX = "interestFree:";

export function isInterestFreePick(id: string): boolean {
  return id.startsWith(INTEREST_FREE_PREFIX);
}

export function labelForInterestFreePick(id: string): string | null {
  if (!isInterestFreePick(id)) return null;
  try {
    const raw = decodeURIComponent(id.slice(INTEREST_FREE_PREFIX.length));
    return raw || null;
  } catch {
    return null;
  }
}

/** 自由入力タグ（80文字まで）を pick ID にする */
export function makeInterestFreePick(label: string): string {
  const t = label.trim().slice(0, 80);
  if (!t) return "";
  return `${INTEREST_FREE_PREFIX}${encodeURIComponent(t)}`;
}

/** 特定小分類向けの詳細自由入力（80文字まで） */
export function makeUserFinePick(subId: string, label: string): string {
  const t = label.trim().slice(0, 80);
  if (!t) return "";
  return `${subId}${INTEREST_USER_FINE_INFIX}${encodeURIComponent(t)}`;
}

export function isUserFinePick(pickId: string): boolean {
  return pickId.includes(INTEREST_USER_FINE_INFIX);
}

export function labelForUserFinePick(subId: string, pickId: string): string | null {
  const prefix = `${subId}${INTEREST_USER_FINE_INFIX}`;
  if (!pickId.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(pickId.slice(prefix.length)) || null;
  } catch {
    return null;
  }
}

/** 小分類ごとの詳細チップ（未指定時は共通ラベル） */
export function defaultFinesForSub(sub: InterestSub): InterestFine[] {
  if (sub.fine && sub.fine.length > 0) return sub.fine;
  return [
    { id: `${sub.id}:often`, label: "よく楽しむ" },
    { id: `${sub.id}:sometimes`, label: "ときどき" },
    { id: `${sub.id}:fan`, label: "推しがいる" },
  ];
}

/** micro / works を持つ詳細タグか */
export function interestFineHasNestedExtras(f: InterestFine): boolean {
  return ((f.micro?.length ?? 0) + (f.works?.length ?? 0)) > 0;
}

/** 詳細タグ本体またはその micro / works が選択されている */
export function isFineBranchSelected(picks: string[], fine: InterestFine): boolean {
  if (picks.includes(fine.id)) return true;
  for (const ch of [...(fine.micro ?? []), ...(fine.works ?? [])]) {
    if (picks.includes(ch.id)) return true;
  }
  return false;
}

/** 詳細タグと、その配下（`fineId:` で始まる子）をすべて除去 */
export function stripFineBranchFromPicks(picks: string[], fine: InterestFine): string[] {
  return picks.filter((x) => x !== fine.id && !x.startsWith(`${fine.id}:`));
}

export function findInterestFineInSub(sub: InterestSub, fineId: string): InterestFine | null {
  for (const f of defaultFinesForSub(sub)) {
    if (f.id === fineId) return f;
  }
  return null;
}

export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    id: "music",
    label: "音楽",
    subs: [
      { id: "music:jpop", label: "J-POP", fine: MUSIC_JPOP_FINES as InterestFine[] },
      { id: "music:kpop", label: "K-POP", fine: MUSIC_KPOP_FINES as InterestFine[] },
      { id: "music:rock", label: "ロック", fine: MUSIC_ROCK_FINES as InterestFine[] },
      { id: "music:classical", label: "クラシック", fine: MUSIC_CLASSICAL_FINES as InterestFine[] },
      { id: "music:jazz", label: "ジャズ", fine: MUSIC_JAZZ_FINES as InterestFine[] },
      { id: "music:anime", label: "アニソン", fine: MUSIC_ANIME_SONG_FINES as InterestFine[] },
      { id: "music:idol", label: "アイドル", fine: MUSIC_IDOL_FINES as InterestFine[] },
      { id: "music:vocaloid", label: "ボカロ", fine: MUSIC_VOCALOID_FINES as InterestFine[] },
      { id: "music:hiphop", label: "ヒップホップ", fine: MUSIC_HIPHOP_FINES as InterestFine[] },
      { id: "music:citypop", label: "シティポップ・AOR", fine: MUSIC_CITYPOP_FINES as InterestFine[] },
      { id: "music:edm", label: "EDM・クラブ", fine: MUSIC_EDM_FINES as InterestFine[] },
      { id: "music:stage", label: "ミュージカル・舞台", fine: MUSIC_STAGE_FINES as InterestFine[] },
      { id: "music:reggae", label: "レゲエ・スカ・ラテン", fine: MUSIC_REGGAE_FINES as InterestFine[] },
      { id: "music:other", label: "その他", fine: MUSIC_OTHER_FINES as InterestFine[] },
    ],
  },
  {
    id: "sports",
    label: "スポーツ",
    subs: [
      { id: "sports:soccer", label: "サッカー", fine: SPORTS_SOCCER_FINES as InterestFine[] },
      { id: "sports:baseball", label: "野球", fine: SPORTS_BASEBALL_FINES as InterestFine[] },
      { id: "sports:tennis", label: "テニス", fine: SPORTS_TENNIS_FINES as InterestFine[] },
      { id: "sports:volleyball", label: "バレーボール", fine: SPORTS_VOLLEYBALL_FINES as InterestFine[] },
      { id: "sports:basketball", label: "バスケ", fine: SPORTS_BASKETBALL_FINES as InterestFine[] },
      { id: "sports:cricket", label: "クリケット", fine: SPORTS_CRICKET_FINES as InterestFine[] },
      { id: "sports:running", label: "ランニング", fine: SPORTS_RUNNING_FINES as InterestFine[] },
      { id: "sports:swimming", label: "水泳", fine: SPORTS_SWIMMING_FINES as InterestFine[] },
      { id: "sports:martial", label: "格闘技", fine: SPORTS_MARTIAL_FINES as InterestFine[] },
      { id: "sports:sumo", label: "相撲", fine: SPORTS_SUMO_FINES as InterestFine[] },
      { id: "sports:rugby", label: "ラグビー", fine: SPORTS_RUGBY_FINES as InterestFine[] },
      { id: "sports:badminton", label: "バドミントン", fine: SPORTS_BADMINTON_FINES as InterestFine[] },
      { id: "sports:table_tennis", label: "卓球", fine: SPORTS_TABLE_TENNIS_FINES as InterestFine[] },
      { id: "sports:skate", label: "スケート", fine: SPORTS_SKATE_FINES as InterestFine[] },
      { id: "sports:gymnastics", label: "体操・新体操", fine: SPORTS_GYMNASTICS_FINES as InterestFine[] },
      { id: "sports:motor", label: "モータースポーツ", fine: SPORTS_MOTOR_FINES as InterestFine[] },
      { id: "sports:surf", label: "サーフィン・マリンスポーツ", fine: SPORTS_SURF_FINES as InterestFine[] },
      { id: "sports:other", label: "その他", fine: SPORTS_OTHER_FINES as InterestFine[] },
    ],
  },
  {
    id: "media",
    label: "映像・エンタメ",
    subs: [
      {
        id: "media:anime",
        label: "アニメ",
        fine: MEDIA_ANIME_FINES as InterestFine[],
      },
      { id: "media:manga", label: "漫画", fine: MEDIA_MANGA_FINES as InterestFine[] },
      { id: "media:lightnovel", label: "ラノベ・小説", fine: MEDIA_LIGHTNOVEL_FINES as InterestFine[] },
      { id: "media:movie", label: "映画", fine: MEDIA_MOVIE_FINES as InterestFine[] },
      { id: "media:drama", label: "ドラマ", fine: MEDIA_DRAMA_FINES as InterestFine[] },
      { id: "media:youtube", label: "YouTube", fine: MEDIA_YOUTUBE_FINES as InterestFine[] },
      { id: "media:vtuber", label: "VTuber", fine: MEDIA_VTUBER_FINES as InterestFine[] },
      { id: "media:variety", label: "バラエティ", fine: MEDIA_VARIETY_FINES as InterestFine[] },
      { id: "media:other", label: "その他", fine: MEDIA_OTHER_FINES as InterestFine[] },
    ],
  },
  {
    id: "games",
    label: "ゲーム",
    subs: [
      { id: "games:console", label: "家庭用ゲーム", fine: GAMES_CONSOLE_FINES as InterestFine[] },
      { id: "games:pc", label: "PCゲーム", fine: GAMES_PC_FINES as InterestFine[] },
      { id: "games:mobile", label: "スマホゲーム", fine: GAMES_MOBILE_FINES as InterestFine[] },
      { id: "games:board", label: "ボードゲーム", fine: GAMES_BOARD_FINES as InterestFine[] },
      { id: "games:tcg", label: "TCG", fine: GAMES_TCG_FINES as InterestFine[] },
      { id: "games:esports", label: "eスポーツ", fine: GAMES_ESPORTS_FINES as InterestFine[] },
      { id: "games:fighting", label: "対戦格闘・対戦ACT", fine: GAMES_FIGHTING_FINES as InterestFine[] },
      { id: "games:horror", label: "ホラー・サバイバル", fine: GAMES_HORROR_FINES as InterestFine[] },
      { id: "games:visual_novel", label: "ノベル・ADV", fine: GAMES_VN_FINES as InterestFine[] },
      { id: "games:speedrun", label: "RTA・攻略研究", fine: GAMES_SPEEDRUN_FINES as InterestFine[] },
      { id: "games:other", label: "その他", fine: GAMES_OTHER_FINES as InterestFine[] },
    ],
  },
  {
    id: "creative",
    label: "創作・表現",
    subs: [
      {
        id: "creative:art",
        label: "美術",
        fine: [
          { id: "creative:art:oil_acrylic", label: "油彩・アクリル" },
          { id: "creative:art:watercolor", label: "水彩・日本画" },
          { id: "creative:art:digital_paint", label: "デジタルペイント" },
          { id: "creative:art:sculpture", label: "彫刻・立体" },
          { id: "creative:art:museum", label: "美術館・現代美術鑑賞" },
          { id: "creative:art:printmaking", label: "版画・リトグラフ" },
          { id: "creative:art:comic_art", label: "イラスト・漫画表現" },
        ],
      },
      {
        id: "creative:photo",
        label: "写真",
        fine: [
          { id: "creative:photo:landscape", label: "風景・自然" },
          { id: "creative:photo:portrait", label: "ポートレート" },
          { id: "creative:photo:street_snap", label: "ストリート・スナップ" },
          { id: "creative:photo:film", label: "フィルム・アナログ" },
          { id: "creative:photo:astro", label: "星空・天体" },
          { id: "creative:photo:wildlife", label: "野鳥・野生生物" },
          { id: "creative:photo:macro", label: "マクロ・植物・静物" },
        ],
      },
      {
        id: "creative:writing",
        label: "小説・執筆",
        fine: [
          { id: "creative:writing:novel", label: "小説・長編" },
          { id: "creative:writing:short", label: "短編・エッセイ" },
          { id: "creative:writing:blog", label: "ブログ・note" },
          { id: "creative:writing:fanfic", label: "二次創作・同人" },
          { id: "creative:writing:scenario", label: "脚本・シナリオ" },
          { id: "creative:writing:poetry", label: "詩・歌詞" },
        ],
      },
      {
        id: "creative:music_make",
        label: "作曲・演奏",
        fine: [
          { id: "creative:music_make:dtm", label: "DTM・DAW" },
          { id: "creative:music_make:guitar", label: "ギター・バンド" },
          { id: "creative:music_make:piano_keys", label: "ピアノ・鍵盤" },
          { id: "creative:music_make:vocal", label: "ボーカル・コーラス" },
          { id: "creative:music_make:wind_strings", label: "管楽器・弦楽器" },
          { id: "creative:music_make:dj", label: "DJ・ミックス" },
        ],
      },
      {
        id: "creative:craft",
        label: "ハンドメイド",
        fine: [
          { id: "creative:craft:knit", label: "編み物・ニット" },
          { id: "creative:craft:leather", label: "レザークラフト" },
          { id: "creative:craft:resin", label: "レジン・アクセサリー" },
          { id: "creative:craft:wood", label: "木工・DIY" },
          { id: "creative:craft:sewing", label: "ソーイング・服作り" },
          { id: "creative:craft:pottery", label: "陶芸・ろくろ" },
          { id: "creative:craft:glass", label: "ガラス・ステンド" },
        ],
      },
      {
        id: "creative:dance",
        label: "ダンス",
        fine: [
          { id: "creative:dance:hiphop", label: "ヒップホップ・ストリート" },
          { id: "creative:dance:ballet", label: "バレエ・クラシック" },
          { id: "creative:dance:contemporary", label: "コンテンポラリー" },
          { id: "creative:dance:ballroom", label: "社交ダンス" },
          { id: "creative:dance:cover", label: "コピーダンス・振付" },
        ],
      },
      {
        id: "creative:other",
        label: "その他",
        fine: [
          { id: "creative:other:video_edit", label: "動画編集・映像制作" },
          { id: "creative:other:design", label: "グラフィック・デザイン" },
          { id: "creative:other:typography", label: "タイポグラフィ・フォント" },
          { id: "creative:other:calligraphy", label: "書道・ペン字" },
        ],
      },
    ],
  },
  {
    id: "outdoor",
    label: "アウトドア・旅行",
    subs: [
      {
        id: "outdoor:hiking",
        label: "登山・ハイキング",
        fine: [
          { id: "outdoor:hiking:hyakumeizan", label: "百名山・高山" },
          { id: "outdoor:hiking:low_mountain", label: "低山・日帰り" },
          { id: "outdoor:hiking:overnight_mtn", label: "山小屋・縦走" },
          { id: "outdoor:hiking:trail_run", label: "トレイルランニング" },
        ],
      },
      {
        id: "outdoor:camp",
        label: "キャンプ",
        fine: [
          { id: "outdoor:camp:solo", label: "ソロキャンプ" },
          { id: "outdoor:camp:family", label: "ファミリー・グループ" },
          { id: "outdoor:camp:glamping", label: "グランピング" },
          { id: "outdoor:camp:bonfire", label: "焚き火・ギア弄り" },
        ],
      },
      {
        id: "outdoor:travel",
        label: "旅行",
        fine: [
          { id: "outdoor:travel:domestic", label: "国内旅行" },
          { id: "outdoor:travel:asia", label: "アジア" },
          { id: "outdoor:travel:europe", label: "ヨーロッパ" },
          { id: "outdoor:travel:americas", label: "アメリカ・中南米" },
          { id: "outdoor:travel:onsen", label: "温泉宿・湯治" },
          { id: "outdoor:travel:solo", label: "一人旅・ノマド" },
          { id: "outdoor:travel:rail", label: "鉄道旅・乗り鉄" },
        ],
      },
      {
        id: "outdoor:fishing",
        label: "釣り",
        fine: [
          { id: "outdoor:fishing:sea", label: "海釣り・船" },
          { id: "outdoor:fishing:stream", label: "渓流・川" },
          { id: "outdoor:fishing:pond", label: "管理釣り場・池" },
          { id: "outdoor:fishing:eging", label: "エギング・アジング等" },
        ],
      },
      {
        id: "outdoor:cycling",
        label: "サイクリング",
        fine: [
          { id: "outdoor:cycling:road", label: "ロードバイク" },
          { id: "outdoor:cycling:mtb", label: "MTB・グラベル" },
          { id: "outdoor:cycling:city", label: "街乗り・ポタリング" },
          { id: "outdoor:cycling:long", label: "ロングライド" },
          { id: "outdoor:cycling:e_bike", label: "E-Bike・電動アシスト" },
        ],
      },
      {
        id: "outdoor:ski",
        label: "スキー・スノーボード",
        fine: [
          { id: "outdoor:ski:alpine", label: "アルペン・ゲレンデ" },
          { id: "outdoor:ski:backcountry", label: "バックカントリー・BC" },
          { id: "outdoor:ski:snowpark", label: "パーク・グラトリ" },
          { id: "outdoor:ski:gear", label: "板・ウェア・ギア沼" },
        ],
      },
      {
        id: "outdoor:motorcycle",
        label: "バイク・ツーリング",
        fine: [
          { id: "outdoor:motorcycle:touring", label: "ツーリング・ロング" },
          { id: "outdoor:motorcycle:offroad", label: "オフロード・ADV" },
          { id: "outdoor:motorcycle:cafe", label: "カフェ・車両カスタム" },
        ],
      },
      {
        id: "outdoor:other",
        label: "その他",
        fine: [
          { id: "outdoor:other:kayak", label: "カヤック・SUP" },
          { id: "outdoor:other:climb", label: "クライミング・ボルダリング" },
          { id: "outdoor:other:diving", label: "ダイビング・スキューバ" },
        ],
      },
    ],
  },
  {
    id: "food",
    label: "グルメ",
    subs: [
      {
        id: "food:cooking",
        label: "料理",
        fine: [
          { id: "food:cooking:japanese", label: "和食" },
          { id: "food:cooking:western", label: "洋食" },
          { id: "food:cooking:chinese", label: "中華" },
          { id: "food:cooking:korean_home", label: "韓国家庭料理" },
          { id: "food:cooking:thai_viet", label: "タイ・ベトナム等エスニック" },
          { id: "food:cooking:bread", label: "パン・ベーカリー" },
          { id: "food:cooking:meal_prep", label: "作り置き・弁当" },
          { id: "food:cooking:fermentation", label: "発酵・漬物・味噌作り" },
        ],
      },
      {
        id: "food:cafe",
        label: "カフェ巡り",
        fine: [
          { id: "food:cafe:specialty", label: "スペシャルティコーヒー" },
          { id: "food:cafe:chain", label: "チェーン・ワークカフェ" },
          { id: "food:cafe:kissaten", label: "喫茶店・レトロ" },
          { id: "food:cafe:tea", label: "紅茶・中国茶" },
          { id: "food:cafe:third_wave", label: "シングルオリジン・焙煎度探求" },
          { id: "food:cafe:barista", label: "ラテアート・抽出理論" },
        ],
      },
      {
        id: "food:sweets",
        label: "スイーツ",
        fine: [
          { id: "food:sweets:patisserie", label: "パティスリー・ケーキ" },
          { id: "food:sweets:wagashi", label: "和菓子・甘味処" },
          { id: "food:sweets:chocolate", label: "チョコレート" },
          { id: "food:sweets:ice", label: "アイス・ジェラート" },
          { id: "food:sweets:matcha", label: "抹茶・和スイーツ特化" },
          { id: "food:sweets:buffet", label: "スイーツバイキング・食べ歩き" },
        ],
      },
      {
        id: "food:wine",
        label: "お酒",
        fine: [
          { id: "food:wine:sake", label: "日本酒・地酒" },
          { id: "food:wine:wine_grape", label: "ワイン" },
          { id: "food:wine:beer", label: "ビール・クラフト" },
          { id: "food:wine:whisky", label: "ウイスキー・スピリッツ" },
          { id: "food:wine:cocktail", label: "カクテル・バー" },
          { id: "food:wine:natural_wine", label: "ナチュラルワイン" },
          { id: "food:wine:pairing", label: "ペアリング・ソムリエ趣味" },
        ],
      },
      {
        id: "food:yakiniku",
        label: "焼肉・ステーキ",
        fine: [
          { id: "food:yakiniku:horumon", label: "ホルモン・内臓" },
          { id: "food:yakiniku:wagyu", label: "和牛・部位探求" },
          { id: "food:yakiniku:yakiniku_chain", label: "チェーン・一人焼肉" },
          { id: "food:yakiniku:steak", label: "ステーキ・熟成肉" },
        ],
      },
      {
        id: "food:other",
        label: "その他",
        fine: [
          { id: "food:other:ramen", label: "ラーメン・麺類巡礼" },
          { id: "food:other:bbq", label: "BBQ・アウトドア飯" },
          { id: "food:other:spicy", label: "激辛・スパイス探求" },
          { id: "food:other:conbini", label: "コンビニ・新商品ウォッチ" },
        ],
      },
    ],
  },
  {
    id: "learn",
    label: "学び・教養",
    subs: [
      {
        id: "learn:science",
        label: "科学",
        fine: [
          { id: "learn:science:physics", label: "物理・宇宙" },
          { id: "learn:science:biology", label: "生物・医学一般" },
          { id: "learn:science:chemistry", label: "化学・材料" },
          { id: "learn:science:math", label: "数学" },
          { id: "learn:science:earth", label: "地学・気象" },
          { id: "learn:science:psychology_sci", label: "認知・神経科学" },
        ],
      },
      {
        id: "learn:history",
        label: "歴史",
        fine: [
          { id: "learn:history:japan", label: "日本史" },
          { id: "learn:history:world", label: "世界史" },
          { id: "learn:history:archaeology", label: "考古・古代文明" },
          { id: "learn:history:military", label: "軍事史" },
        ],
      },
      {
        id: "learn:language",
        label: "語学",
        fine: [
          { id: "learn:language:english", label: "英語" },
          { id: "learn:language:chinese", label: "中国語" },
          { id: "learn:language:korean", label: "韓国語" },
          { id: "learn:language:european", label: "ヨーロッパ言語" },
          { id: "learn:language:southeast_asia", label: "東南アジア言語" },
          { id: "learn:language:cert", label: "資格試験・TOEIC等スコア" },
        ],
      },
      {
        id: "learn:programming",
        label: "プログラミング",
        fine: [
          { id: "learn:programming:web", label: "Web フロント・バック" },
          { id: "learn:programming:mobile_dev", label: "モバイルアプリ" },
          { id: "learn:programming:ai_ml", label: "AI・機械学習" },
          { id: "learn:programming:infra", label: "インフラ・SRE" },
          { id: "learn:programming:oss", label: "OSS・コントリビュート" },
          { id: "learn:programming:security", label: "セキュリティ・CTF" },
        ],
      },
      {
        id: "learn:law",
        label: "法律・社会",
        fine: [
          { id: "learn:law:civil", label: "民法・契約" },
          { id: "learn:law:labor", label: "労働法" },
          { id: "learn:law:ip", label: "知的財産" },
          { id: "learn:law:shiho", label: "司法試験・予備試" },
        ],
      },
      {
        id: "learn:psychology",
        label: "心理学・コーチング",
        fine: [
          { id: "learn:psychology:cbt", label: "認知行動・カウンセリング理論" },
          { id: "learn:psychology:adler", label: "アドラー等心理学派" },
          { id: "learn:psychology:child", label: "発達・子育て心理学" },
        ],
      },
      {
        id: "learn:art_history",
        label: "美術史・デザイン史",
        fine: [
          { id: "learn:art_history:western", label: "西洋美術史" },
          { id: "learn:art_history:japanese_art", label: "日本美術史" },
          { id: "learn:art_history:design", label: "デザイン史・建築史" },
        ],
      },
      {
        id: "learn:other",
        label: "その他",
        fine: [
          { id: "learn:other:philosophy", label: "哲学・倫理" },
          { id: "learn:other:economy", label: "経済・投資の学び" },
          { id: "learn:other:shikaku", label: "資格試験全般（簿記・宅建等）" },
        ],
      },
    ],
  },
  {
    id: "tech",
    label: "テック・ガジェット",
    subs: [
      {
        id: "tech:smartphone",
        label: "スマホ・モバイル",
        fine: [
          { id: "tech:smartphone:iphone", label: "iPhone" },
          { id: "tech:smartphone:android", label: "Android" },
          { id: "tech:smartphone:wearable", label: "スマートウォッチ" },
          { id: "tech:smartphone:accessories", label: "ケース・周辺機器" },
          { id: "tech:smartphone:mobile_photo", label: "スマホ写真・レンズアタッチ" },
        ],
      },
      {
        id: "tech:pc_build",
        label: "PC・自作",
        fine: [
          { id: "tech:pc_build:custom", label: "自作デスクトップ" },
          { id: "tech:pc_build:gaming_pc", label: "ゲーミングPC" },
          { id: "tech:pc_build:laptop", label: "ノートPC" },
          { id: "tech:pc_build:linux", label: "Linux・サーバ" },
          { id: "tech:pc_build:homelab", label: "Homelab・NAS・自宅サーバ" },
        ],
      },
      {
        id: "tech:iot",
        label: "スマート家電",
        fine: [
          { id: "tech:iot:smart_speaker", label: "スマートスピーカー" },
          { id: "tech:iot:home_auto", label: "ホームオートメーション" },
          { id: "tech:iot:robot_vac", label: "ロボット掃除機等" },
        ],
      },
      {
        id: "tech:audio_gear",
        label: "オーディオ機器",
        fine: [
          { id: "tech:audio_gear:headphones", label: "ヘッドホン・イヤホン" },
          { id: "tech:audio_gear:dap", label: "DAP・ポータブル" },
          { id: "tech:audio_gear:speakers", label: "スピーカー・アンプ" },
          { id: "tech:audio_gear:cables", label: "ケーブル・電源処理" },
        ],
      },
      {
        id: "tech:other",
        label: "その他",
        fine: [
          { id: "tech:other:keyboard", label: "キーボード・入力デバイス" },
          { id: "tech:other:photo_gear", label: "カメラ・レンズ機材" },
          { id: "tech:other:3dprint", label: "3Dプリンタ・CAD" },
          { id: "tech:other:ev_tech", label: "EV・充電・モビリティ" },
        ],
      },
    ],
  },
  {
    id: "fashion",
    label: "ファッション・美容",
    subs: [
      {
        id: "fashion:street",
        label: "ストリート",
        fine: [
          { id: "fashion:street:sneaker", label: "スニーカー" },
          { id: "fashion:street:workwear", label: "ワーク・ミリタリー" },
          { id: "fashion:street:techwear", label: "テックウェア" },
          { id: "fashion:street:denim", label: "デニム・セルビッジ" },
          { id: "fashion:street:archive", label: "アーカイブ・デザイナー物" },
        ],
      },
      {
        id: "fashion:vintage",
        label: "ヴィンテージ",
        fine: [
          { id: "fashion:vintage:us", label: "アメリカ古着" },
          { id: "fashion:vintage:eu", label: "ヨーロッパ古着" },
          { id: "fashion:vintage:select", label: "セレクトショップ" },
        ],
      },
      {
        id: "fashion:beauty",
        label: "コスメ・美容",
        fine: [
          { id: "fashion:beauty:skincare", label: "スキンケア" },
          { id: "fashion:beauty:makeup", label: "メイク" },
          { id: "fashion:beauty:hair", label: "ヘアケア・サロン" },
          { id: "fashion:beauty:nail", label: "ネイル" },
          { id: "fashion:beauty:fragrance", label: "香水・フレグランス" },
          { id: "fashion:beauty:derma", label: "皮膚科・エステ科学" },
        ],
      },
      {
        id: "fashion:other",
        label: "その他",
        fine: [
          { id: "fashion:other:minimal", label: "ミニマル・きれいめ" },
          { id: "fashion:other:kimono", label: "着物・和装" },
          { id: "fashion:other:watch", label: "腕時計・機械式" },
          { id: "fashion:other:sustainable", label: "サステナブル・エシカル" },
        ],
      },
    ],
  },
  {
    id: "pets",
    label: "ペット・動物",
    subs: [
      {
        id: "pets:dog",
        label: "犬",
        fine: [
          { id: "pets:dog:large", label: "大型犬" },
          { id: "pets:dog:small", label: "小型犬" },
          { id: "pets:dog:multi", label: "多頭飼い" },
          { id: "pets:dog:training", label: "しつけ・ドッグラン" },
          { id: "pets:dog:agility", label: "アジリティ・ドッグスポーツ" },
          { id: "pets:dog:handmade_food", label: "手作りごはん・トリミング" },
        ],
      },
      {
        id: "pets:cat",
        label: "猫",
        fine: [
          { id: "pets:cat:kitten", label: "子猫・キトン" },
          { id: "pets:cat:senior", label: "シニア猫" },
          { id: "pets:cat:multi_cat", label: "複数飼い" },
          { id: "pets:cat:indoor", label: "完全室内飼い" },
          { id: "pets:cat:feral_support", label: "地域猫・保護活動" },
          { id: "pets:cat:tower", label: "キャットタワー・環境づくり" },
        ],
      },
      {
        id: "pets:small",
        label: "小動物",
        fine: [
          { id: "pets:small:hamster", label: "ハムスター" },
          { id: "pets:small:rabbit", label: "ウサギ" },
          { id: "pets:small:bird", label: "鳥類" },
          { id: "pets:small:reptile", label: "爬虫類" },
          { id: "pets:small:ferret", label: "フェレット" },
          { id: "pets:small:hedgehog", label: "ハリネズミ等エキゾチック" },
        ],
      },
      {
        id: "pets:aquarium",
        label: "水族・アクア",
        fine: [
          { id: "pets:aquarium:fresh", label: "淡水熱帯魚" },
          { id: "pets:aquarium:salt", label: "海水魚・サンゴ" },
          { id: "pets:aquarium:aquascape", label: "水草レイアウト・アクアリウム" },
          { id: "pets:aquarium:shrimp", label: "エビ・巻貝水槽" },
        ],
      },
      {
        id: "pets:other",
        label: "その他",
        fine: [
          { id: "pets:other:zoo", label: "動物園・水族館通い" },
          { id: "pets:other:wildlife", label: "野鳥・野生動物観察" },
          { id: "pets:other:horse", label: "馬・乗馬" },
          { id: "pets:other:insect", label: "昆虫・カブトクワガタ" },
        ],
      },
    ],
  },
  {
    id: "life",
    label: "暮らし・健康",
    subs: [
      {
        id: "life:interior",
        label: "インテリア",
        fine: [
          { id: "life:interior:nordic", label: "北欧・ナチュラル" },
          { id: "life:interior:muji", label: "無印・ミニマル" },
          { id: "life:interior:plants", label: "観葉植物" },
          { id: "life:interior:diy_interior", label: "DIY・収納" },
          { id: "life:interior:lighting", label: "照明・間接光" },
        ],
      },
      {
        id: "life:minimal",
        label: "ミニマル・整理",
        fine: [
          { id: "life:minimal:declutter", label: "断捨離・片付け" },
          { id: "life:minimal:cap", label: "持たない暮らし" },
          { id: "life:minimal:digital", label: "デジタルミニマル" },
        ],
      },
      {
        id: "life:fitness",
        label: "フィットネス",
        fine: [
          { id: "life:fitness:gym", label: "ジム・ウェイト" },
          { id: "life:fitness:yoga", label: "ヨガ・ピラティス" },
          { id: "life:fitness:crossfit", label: "クロスフィット・HIIT" },
          { id: "life:fitness:calisthenics", label: "自重トレーニング" },
          { id: "life:fitness:running_gym", label: "ランニングマシン・有酸素" },
          { id: "life:fitness:stretch", label: "ストレッチ・柔軟" },
        ],
      },
      {
        id: "life:mental",
        label: "メンタルケア",
        fine: [
          { id: "life:mental:meditation", label: "瞑想・マインドフルネス" },
          { id: "life:mental:journal", label: "日記・ジャーナリング" },
          { id: "life:mental:therapy", label: "カウンセリング・セラピー" },
          { id: "life:mental:sleep", label: "睡眠衛生" },
        ],
      },
      {
        id: "life:other",
        label: "その他",
        fine: [
          { id: "life:other:habit", label: "習慣化・自己管理" },
          { id: "life:other:finance_life", label: "家計・FIRE 等" },
          { id: "life:other:productivity", label: "GTD・タスク管理ツール" },
          { id: "life:other:parenting", label: "育児・子育てコミュニティ" },
        ],
      },
    ],
  },
];

/** 関心タグ1件が属する大分類ラベル（チャット要約用） */
export function interestCategoryLabelForPick(pickId: string): string | null {
  if (isInterestFreePick(pickId)) {
    return "自由入力";
  }
  for (const c of INTEREST_CATEGORIES) {
    for (const s of c.subs) {
      if (pickId === s.id || pickId.startsWith(`${s.id}:`)) {
        return c.label;
      }
    }
  }
  return null;
}

/**
 * チャットログ用: 大分類中心の短い要約（「N件選択」より負担が少ない表現）
 */
export function summarizeInterestPicksForChatLog(picks: string[]): string {
  if (picks.length === 0) return "（未選択）";
  const order: string[] = [];
  const seen = new Set<string>();
  for (const p of picks) {
    const lab = interestCategoryLabelForPick(p);
    if (!lab || seen.has(lab)) continue;
    seen.add(lab);
    order.push(lab);
  }
  if (order.length === 0) {
    return "関心: 自由入力タグを指定";
  }
  const max = 3;
  const head = order.slice(0, max);
  const moreCats = order.length - head.length;
  let out = `関心: ${head.join("・")}`;
  if (moreCats > 0) out += ` ほか${moreCats}分野`;
  return out;
}

export function labelForInterestPick(pickId: string): string | null {
  if (isInterestFreePick(pickId)) {
    const inner = labelForInterestFreePick(pickId);
    return inner ? `自由入力 › ${inner}` : null;
  }
  for (const c of INTEREST_CATEGORIES) {
    for (const s of c.subs) {
      if (s.id === pickId) return `${c.label} › ${s.label}`;
      if (pickId.startsWith(`${s.id}${INTEREST_USER_FINE_INFIX}`)) {
        const inner = labelForUserFinePick(s.id, pickId);
        return inner ? `${c.label} › ${s.label} › ${inner}` : null;
      }
      const fines = defaultFinesForSub(s);
      const f = fines.find((x) => x.id === pickId);
      if (f) return `${c.label} › ${s.label} › ${f.label}`;
      for (const pf of fines) {
        for (const ch of [...(pf.micro ?? []), ...(pf.works ?? [])]) {
          if (pickId === ch.id) return `${c.label} › ${s.label} › ${pf.label} › ${ch.label}`;
        }
      }
    }
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
