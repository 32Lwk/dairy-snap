import { ABROAD_COUNTRY_OPTIONS } from "./abroad-country-options";
import { adjacentPrefectureValues } from "./prefecture-adjacency";
import { formatTimetableSummary, TT_PREFIX } from "./timetable";

export { ABROAD_COUNTRY_OPTIONS };

/**
 * オンボーディング「暮らし・職業」: 1問ずつ・分岐。
 * 順序は「具体的事実 → 行動・時間 → やや個人的な経歴」の流れ（負担の軽い順）を意識。
 * 回答は occupationNote / studentLifeNotes / education に整形して保存。
 */

export type WorkLifeOption = { value: string; label: string };

export type WorkLifeInputKind =
  | "select"
  | "multi_select"
  | "multi_chips"
  | "school"
  | "short_text"
  | "timetable";

export type WorkLifeQuestion = {
  id: string;
  assistant: string;
  inputKind?: WorkLifeInputKind;
  options?: WorkLifeOption[];
  logPrefix: string;
  shortTextPlaceholder?: string;
};

/** 学校選択の保存形式（JSON 文字列） */
export type SchoolPickPayload = { t: "pick"; id: string; name: string; prefecture: string; city: string };
export type SchoolManualPayload = { t: "man"; text: string };

export function encodeSchoolWorkAnswer(
  sel: { id: string; name: string; prefecture: string; city: string } | null,
  manual: string,
): string {
  if (sel) {
    const payload: SchoolPickPayload = {
      t: "pick",
      id: sel.id,
      name: sel.name,
      prefecture: sel.prefecture,
      city: sel.city,
    };
    return JSON.stringify(payload);
  }
  const t = manual.trim();
  if (t) {
    const payload: SchoolManualPayload = { t: "man", text: t };
    return JSON.stringify(payload);
  }
  return "";
}

export function schoolWorkAnswerToLabel(encoded: string): string {
  if (!encoded.trim()) return "";
  try {
    const o = JSON.parse(encoded) as SchoolPickPayload | SchoolManualPayload;
    if (o.t === "pick") return `${o.name}（${o.prefecture}${o.city ? `・${o.city}` : ""}）`;
    if (o.t === "man") return o.text;
  } catch {
    /* ignore */
  }
  return "";
}

export function schoolWorkAnswerToComposeLine(encoded: string): string {
  return schoolWorkAnswerToLabel(encoded);
}

/** 保存済み JSON から一覧選択を復元（フォーム表示用） */
export function decodeSchoolWorkPick(
  encoded: string,
): { id: string; name: string; prefecture: string; city: string; kind?: string } | null {
  if (!encoded.trim()) return null;
  try {
    const o = JSON.parse(encoded) as SchoolPickPayload | SchoolManualPayload;
    if (o.t === "pick" && o.id && o.name) {
      return { id: o.id, name: o.name, prefecture: o.prefecture, city: o.city };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function decodeSchoolWorkManual(encoded: string): string {
  if (!encoded.trim()) return "";
  try {
    const o = JSON.parse(encoded) as SchoolManualPayload;
    if (o.t === "man") return o.text ?? "";
  } catch {
    /* ignore */
  }
  return "";
}

/** 学生ブロックのみ `studentLifeNotes` 用に整形（経歴テキストは触らない） */
export function composeStudentLifeNotesLine(answers: Record<string, string>): string {
  const st: string[] = [];
  const a = answers.st_level ? labelOf(ST_LEVEL_OPTIONS, answers.st_level) : "";
  const schoolLine = schoolWorkAnswerToComposeLine(answers.st_school ?? "");
  const uy = answers.st_univ_year ? labelOf(ST_UNIV_YEAR_OPTIONS, answers.st_univ_year) : "";
  const uf = answers.st_univ_field ? labelOf(ST_UNIV_FIELD_OPTIONS, answers.st_univ_field) : "";
  const b = answers.st_home_style ? labelOf(ST_HOME_STYLE_OPTIONS, answers.st_home_style) : "";
  const c = answers.st_home_pref ? labelOf(PREFECTURE_OPTIONS, answers.st_home_pref) : "";
  const e = answers.st_commute ? labelOf(COMMUTE_OPTIONS, answers.st_commute) : "";
  const g = (answers.st_timetable_note ?? "").trim();
  if (a) st.push(`段階: ${a}`);
  if (schoolLine) st.push(`学校: ${schoolLine}`);
  if (uy) st.push(`学年: ${uy}`);
  if (uf) st.push(`学問領域: ${uf}`);
  if (b) st.push(`住まい: ${b}`);
  if (c) st.push(`住まいの地域: ${c}`);
  if (e) st.push(`通学: ${e}`);
  if (g.startsWith(TT_PREFIX)) {
    /* 表形式の時間割は profile.studentTimetable に完全保存。ここでは要約を重ねない */
  } else {
    const ttLine = formatTimetableSummary(g);
    if (ttLine) st.push(ttLine);
    else if (g) st.push(`時間割の補足: ${g}`);
  }
  return st.join(" / ");
}

export const ORIGIN_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "hk", label: "北海道" },
  { value: "tohoku", label: "東北" },
  { value: "kanto", label: "関東" },
  { value: "chubu", label: "中部" },
  { value: "kinki", label: "近畿" },
  { value: "chugoku", label: "中国" },
  { value: "shikoku", label: "四国" },
  { value: "kyushu", label: "九州・沖縄" },
  { value: "abroad", label: "国外で育つ・在住" },
];

export const PREFECTURE_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "北海道", label: "北海道" },
  { value: "青森県", label: "青森県" },
  { value: "岩手県", label: "岩手県" },
  { value: "宮城県", label: "宮城県" },
  { value: "秋田県", label: "秋田県" },
  { value: "山形県", label: "山形県" },
  { value: "福島県", label: "福島県" },
  { value: "茨城県", label: "茨城県" },
  { value: "栃木県", label: "栃木県" },
  { value: "群馬県", label: "群馬県" },
  { value: "埼玉県", label: "埼玉県" },
  { value: "千葉県", label: "千葉県" },
  { value: "東京都", label: "東京都" },
  { value: "神奈川県", label: "神奈川県" },
  { value: "新潟県", label: "新潟県" },
  { value: "富山県", label: "富山県" },
  { value: "石川県", label: "石川県" },
  { value: "福井県", label: "福井県" },
  { value: "山梨県", label: "山梨県" },
  { value: "長野県", label: "長野県" },
  { value: "岐阜県", label: "岐阜県" },
  { value: "静岡県", label: "静岡県" },
  { value: "愛知県", label: "愛知県" },
  { value: "三重県", label: "三重県" },
  { value: "滋賀県", label: "滋賀県" },
  { value: "京都府", label: "京都府" },
  { value: "大阪府", label: "大阪府" },
  { value: "兵庫県", label: "兵庫県" },
  { value: "奈良県", label: "奈良県" },
  { value: "和歌山県", label: "和歌山県" },
  { value: "鳥取県", label: "鳥取県" },
  { value: "島根県", label: "島根県" },
  { value: "岡山県", label: "岡山県" },
  { value: "広島県", label: "広島県" },
  { value: "山口県", label: "山口県" },
  { value: "徳島県", label: "徳島県" },
  { value: "香川県", label: "香川県" },
  { value: "愛媛県", label: "愛媛県" },
  { value: "高知県", label: "高知県" },
  { value: "福岡県", label: "福岡県" },
  { value: "佐賀県", label: "佐賀県" },
  { value: "長崎県", label: "長崎県" },
  { value: "熊本県", label: "熊本県" },
  { value: "大分県", label: "大分県" },
  { value: "宮崎県", label: "宮崎県" },
  { value: "鹿児島県", label: "鹿児島県" },
  { value: "沖縄県", label: "沖縄県" },
  { value: "国外", label: "国外" },
];

const HI_HOME_PREF_QUESTION: WorkLifeQuestion = {
  id: "hi_home_pref",
  assistant:
    "いま主に住んでいる都道府県に近いものはどれですか？（任意・1つ）一覧は全国固定順。出身県と同じなら候補チップから選べます。",
  options: PREFECTURE_OPTIONS,
  logPrefix: "いまの住まい（都道府県）",
};

/** 広域（`ORIGIN_OPTIONS` の value）に含まれる都道府県の value（政令指定都市は含めず都道府県単位） */
const ORIGIN_REGION_TO_PREF_VALUES: Record<string, string[]> = {
  hk: ["北海道"],
  tohoku: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
  kanto: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
  chubu: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
  kinki: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
  chugoku: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  shikoku: ["徳島県", "香川県", "愛媛県", "高知県"],
  kyushu: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
};

/**
 * 出身広域に応じた候補（`hi_origin_pref` のセレクト同期用）。
 * 広域未選択は全国＋国外。`abroad` は国名リスト（`ABROAD_COUNTRY_OPTIONS`）。
 */
export function prefectureOptionsForOriginRegion(originRegionValue: string): WorkLifeOption[] {
  const head = PREFECTURE_OPTIONS[0];
  if (!originRegionValue) {
    return PREFECTURE_OPTIONS;
  }
  if (originRegionValue === "abroad") {
    return ABROAD_COUNTRY_OPTIONS;
  }
  const allow = ORIGIN_REGION_TO_PREF_VALUES[originRegionValue];
  if (!allow?.length) {
    return PREFECTURE_OPTIONS;
  }
  const set = new Set(allow);
  const body = PREFECTURE_OPTIONS.filter((o) => o.value && set.has(o.value));
  return [head, ...body];
}

const PREF_QUESTION_IDS = new Set(["st_home_pref", "hi_origin_pref", "hi_home_pref"]);
/** 学校所在地 + 陸上隣接県を含む場合の上限 */
const MAX_PREF_CHIPS_WITH_ADJ = 14;

function normalizePrefectureOptionValue(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const hit =
    PREFECTURE_OPTIONS.find((o) => o.value === t) || PREFECTURE_OPTIONS.find((o) => o.label === t);
  return hit?.value;
}

function orderedPrefOptionsFromValues(values: Set<string>): WorkLifeOption[] {
  const out: WorkLifeOption[] = [];
  for (const o of PREFECTURE_OPTIONS) {
    if (o.value && values.has(o.value)) out.push(o);
  }
  return out;
}

/**
 * 都道府県セレクト用の候補チップ。一覧の順序は変えず、あくまでショートカット。
 * - st_home_pref: 学校所在地の県 + 陸上隣接県（最大14件）
 * - hi_origin_pref: 広域に含まれる県をすべて（全国固定順）。国外はチップなし（国名は別UI）
 * - hi_home_pref: 出身県 + その県に陸上隣接する県（最大14件）
 */
export function prefectureChipSuggestions(
  questionId: string,
  answers: Record<string, string>,
): WorkLifeOption[] {
  if (!PREF_QUESTION_IDS.has(questionId)) return [];

  if (questionId === "st_home_pref") {
    const vals = new Set<string>();
    const pick = decodeSchoolWorkPick(answers.st_school ?? "");
    if (pick?.prefecture) {
      const nv = normalizePrefectureOptionValue(pick.prefecture);
      if (nv) {
        vals.add(nv);
        for (const adj of adjacentPrefectureValues(nv)) {
          vals.add(adj);
        }
      }
    }
    return orderedPrefOptionsFromValues(vals).slice(0, MAX_PREF_CHIPS_WITH_ADJ);
  }

  if (questionId === "hi_origin_pref") {
    const vals = new Set<string>();
    const region = answers.hi_origin ?? "";
    if (region === "abroad") {
      return [];
    } else {
      const allow = ORIGIN_REGION_TO_PREF_VALUES[region];
      if (allow?.length) {
        const allowSet = new Set(allow);
        for (const o of PREFECTURE_OPTIONS) {
          if (!o.value || o.value === "国外") continue;
          if (!allowSet.has(o.value)) continue;
          vals.add(o.value);
        }
      }
    }
    return orderedPrefOptionsFromValues(vals);
  }

  if (questionId === "hi_home_pref") {
    const vals = new Set<string>();
    const o = answers.hi_origin_pref?.trim();
    if (o && PREFECTURE_OPTIONS.some((p) => p.value === o)) {
      vals.add(o);
      for (const adj of adjacentPrefectureValues(o)) {
        vals.add(adj);
      }
    }
    return orderedPrefOptionsFromValues(vals).slice(0, MAX_PREF_CHIPS_WITH_ADJ);
  }

  return [];
}

export const EDU_LEVEL_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "jh", label: "中学校卒" },
  { value: "hs", label: "高校卒" },
  { value: "voc", label: "専門・短大卒" },
  { value: "univ", label: "大学卒" },
  { value: "grad", label: "大学院卒" },
  { value: "student_now", label: "在学中" },
  { value: "other", label: "その他" },
];

/**
 * 学生は立場上「在学中」が自明のため、通常は学歴から「在学中」を除外。
 * 旧データで `student_now` が残っているときだけ選択肢末尾に出す。
 */
export function eduLevelOptionsForRole(role: string, currentHiEdu = ""): WorkLifeOption[] {
  if (role !== "student") return EDU_LEVEL_OPTIONS;
  const base = EDU_LEVEL_OPTIONS.filter((o) => o.value !== "student_now");
  if (currentHiEdu === "student_now") {
    return [...base, { value: "student_now", label: "在学中（以前の選択）" }];
  }
  return base;
}

/** 本業・長期雇用のイメージ（アルバイトは別問）。旧値 multi / ft / one_plus は表示時に解釈 */
export const CAREER_OPTIONS_GENERAL: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "none", label: "ない（未就業・主に家事・通学など）" },
  { value: "short", label: "短期のみ（数か月以内の雇用・研修など）" },
  { value: "one_long", label: "半年以上、主に一つの職場で働いた" },
  { value: "regular", label: "正社員・契約社員などの雇用での勤務経験がある" },
  { value: "varied_jobs", label: "本業として複数の職種や会社を経てきた" },
  { value: "no_answer", label: "答えたくない" },
];

/** 在学生向け（正社員経験の有無を聞き分けやすく） */
export const CAREER_OPTIONS_STUDENT: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "none", label: "正社員・長期雇用の経験はまだない" },
  { value: "intern_long", label: "長期インターン・現場実習などで半年近く働いた" },
  { value: "short_job", label: "短期の雇用・体験だけ（アルバイト以外含む）" },
  { value: "regular", label: "正社員・契約社員として働いたことがある" },
  { value: "varied_jobs", label: "複数の会社・職種での雇用経験がある" },
  { value: "no_answer", label: "答えたくない" },
];

/** 就職・転職活動中 */
export const CAREER_OPTIONS_JOB_SEEKING: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "none", label: "まだ本業での長期雇用はない" },
  { value: "short", label: "短期・派遣などの経験が中心" },
  { value: "one_long", label: "一つの会社で半年以上働いたことがある" },
  { value: "regular", label: "正社員・契約社員の経験がある" },
  { value: "varied_jobs", label: "複数社・複数職種を経てきた" },
  { value: "no_answer", label: "答えたくない" },
];

/** 主婦・主夫など */
export const CAREER_OPTIONS_HOMEMAKER: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "none", label: "本業としての長期雇用は今はない・ほぼない" },
  { value: "short", label: "短い期間だけ働いたことがある" },
  { value: "one_long", label: "以前、一つの職場で長く働いた" },
  { value: "regular", label: "正社員・パート含め長く雇用で働いた経験がある" },
  { value: "varied_jobs", label: "いくつかの職種・会社を経てきた" },
  { value: "no_answer", label: "答えたくない" },
];

/** @deprecated 表示互換。ロール別は CAREER_OPTIONS_* を使う */
export const CAREER_OPTIONS = CAREER_OPTIONS_GENERAL;

/** アルバイト・パートの「量・継続」（業種は別問・複数可） */
export const PARTTIME_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "none", label: "ほとんど・まったくない" },
  { value: "sometimes", label: "したことがある（たまに）" },
  { value: "ongoing", label: "いまも続けている" },
  { value: "concurrent", label: "かつてしたことがある程度" },
  { value: "no_answer", label: "答えたくない" },
];

/** アルバイト・パートの業種（複数選択。空＝スキップ可） */
export const PARTTIME_INDUSTRY_OPTIONS: WorkLifeOption[] = [
  { value: "food_shop", label: "飲食店" },
  { value: "cafe_bakery", label: "カフェ・ベーカリー" },
  { value: "convenience", label: "コンビニ" },
  { value: "drugstore", label: "ドラッグストア" },
  { value: "supermarket", label: "スーパー" },
  { value: "apparel_goods", label: "アパレル・雑貨・書店" },
  { value: "cinema", label: "映画館" },
  { value: "amusement", label: "ゲームセンター" },
  { value: "hotel_travel", label: "ホテル・観光" },
  { value: "gym_sports", label: "ジム・スポーツ施設" },
  { value: "office", label: "事務" },
  { value: "call_center", label: "コールセンター" },
  { value: "edu_pt", label: "塾・家庭教師" },
  { value: "delivery", label: "配送・物流" },
  { value: "it_light", label: "IT・Web軽作業" },
  { value: "event", label: "イベント・宣伝" },
  { value: "care_light", label: "医療・介護・保育補助" },
  { value: "factory", label: "工場・倉庫・清掃" },
  { value: "beauty", label: "美容" },
  { value: "agri", label: "農業・漁業など" },
  { value: "other", label: "その他" },
];

/** 旧保存値（value）→ 表示用ラベル */
const PARTTIME_INDUSTRY_LEGACY_LABELS: Record<string, string> = {
  food: "飲食・カフェ・フード（旧）",
  retail: "販売・小売・コンビニ（旧）",
  hotel: "宿泊・観光・レジャー施設（旧）",
};

export type ParttimeIndustryPayloadV2 = { v: 2; tags: string[]; free?: string };

/** `hi_pt_industry` 保存値: v2 オブジェクトまたは従来の JSON 配列 */
export function parseParttimeIndustryStored(raw: string): { tags: string[]; free: string } {
  const t = raw.trim();
  if (!t) return { tags: [], free: "" };
  try {
    const o = JSON.parse(t) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o) && (o as ParttimeIndustryPayloadV2).v === 2) {
      const p = o as ParttimeIndustryPayloadV2;
      const tags = Array.isArray(p.tags) ? p.tags.filter((x): x is string => typeof x === "string") : [];
      return { tags, free: typeof p.free === "string" ? p.free : "" };
    }
    if (Array.isArray(o)) {
      return { tags: o.filter((x): x is string => typeof x === "string" && x.length > 0), free: "" };
    }
  } catch {
    /* ignore */
  }
  return { tags: [], free: "" };
}

export function encodeParttimeIndustryStored(tags: string[], free: string): string {
  const u = [...new Set(tags.filter(Boolean))].sort();
  const f = u.includes("other") ? free.trim() : "";
  if (!u.length && !f) return "";
  return JSON.stringify({ v: 2 as const, tags: u, ...(f ? { free: f } : {}) });
}

function parttimeIndustryTagLabel(value: string): string {
  return labelOf(PARTTIME_INDUSTRY_OPTIONS, value) || PARTTIME_INDUSTRY_LEGACY_LABELS[value] || value;
}

export function formatParttimeIndustryLine(tags: string[], free: string): string {
  const parts: string[] = [];
  if (tags.length) parts.push(tags.map(parttimeIndustryTagLabel).join("、"));
  const f = free.trim();
  if (f) parts.push(f.length > 80 ? `${f.slice(0, 80)}…` : f);
  return parts.join(" / ");
}

export const COMMUTE_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "walk", label: "徒歩・自転車が中心" },
  { value: "u30", label: "〜30分程度" },
  { value: "30_60", label: "30分〜1時間程度" },
  { value: "60p", label: "1時間以上" },
  { value: "remote", label: "通学・通勤ほぼなし（在宅・オンライン中心）" },
];

export const ST_LEVEL_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "jh", label: "中学生" },
  { value: "hs", label: "高校生" },
  { value: "tech", label: "高専・専門学生" },
  { value: "jun_col", label: "短大・専門学校" },
  { value: "univ", label: "大学生・大学院生" },
  { value: "other", label: "その他" },
];

export const ST_HOME_STYLE_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "parents", label: "実家" },
  { value: "alone", label: "一人暮らし" },
  { value: "share", label: "シェア・友人・親族宅" },
  { value: "dorm", label: "寮・学生寮・社宅" },
  { value: "other", label: "その他" },
];

/** 大学・大学院生向け（中学生・高校生などは「選ばない」） */
export const ST_UNIV_YEAR_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない 該当しない" },
  { value: "b1", label: "学部1年次" },
  { value: "b2", label: "学部2年次" },
  { value: "b3", label: "学部3年次" },
  { value: "b4", label: "学部4年次" },
  { value: "m1", label: "修士1年次" },
  { value: "m2", label: "修士2年次" },
  { value: "doc", label: "博士課程" },
  { value: "pro", label: "専門職大学院など" },
];

export const ST_UNIV_FIELD_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない 該当しない" },
  { value: "humanities", label: "人文・語学・文学" },
  { value: "law_soc", label: "法学・政治・社会" },
  { value: "econ", label: "経済・経営・商学" },
  { value: "edu", label: "教育学・教員課程" },
  { value: "stem", label: "理学・工学・情報" },
  { value: "med", label: "医学・歯学・薬学・看護・保健" },
  { value: "agri", label: "農学・環境・食" },
  { value: "art", label: "芸術・デザイン" },
  { value: "intl", label: "国際・地域・総合" },
  { value: "other", label: "その他" },
];

/** 学校の主な通学先と、いまの住まいの位置関係 */
export const ST_CAMPUS_VS_HOME_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  {
    value: "same_area",
    label: "学校は、いまの住まいと同じ都道府県内（またはすぐ隣で通える距離）",
  },
  {
    value: "different_pref",
    label: "学校は別の都道府県で、週末などに帰る生活が近い",
  },
  { value: "far", label: "学校は遠方で、長期でその場にいることが多い" },
  { value: "online", label: "オンライン中心で、通学先の場所はあまり固定しない" },
];

export const ST_TIMETABLE_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "early", label: "朝〜午前の授業が続く日が多い" },
  { value: "afternoon", label: "午後〜夕方まで授業や活動が続く日が多い" },
  { value: "block", label: "集中講義・ゼミ・実習で週ごとにばらつきが大きい" },
  { value: "hybrid", label: "オンラインと対面が混ざっている" },
  { value: "weekend_night", label: "土日や夜に授業・講義がある" },
  { value: "flex", label: "かなり自主性が高い（大学院・研究など）" },
  { value: "other", label: "その他" },
];

export const CO_INDUSTRY_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "it", label: "IT・Web・ゲーム" },
  { value: "mfg", label: "製造・建設・不動産" },
  { value: "medical", label: "医療・福祉・介護" },
  { value: "retail", label: "小売・飲食・サービス" },
  { value: "finance", label: "金融・保険" },
  { value: "creative", label: "広告・出版・映像" },
  { value: "edu_like", label: "教育・公共に近い民間" },
  { value: "other", label: "その他" },
];

export const CO_STYLE_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "ft", label: "正社員（フルタイム）" },
  { value: "pt", label: "パート・アルバイト" },
  { value: "contract", label: "契約・派遣" },
  { value: "home", label: "在宅・リモート多め" },
  { value: "field", label: "外勤・出張多め" },
  { value: "other", label: "その他" },
];

export const PS_FIELD_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "edu", label: "教育（学校・講師など）" },
  { value: "gov", label: "行政・公務" },
  { value: "med", label: "公立医療・福祉" },
  { value: "other", label: "その他" },
];

export const SE_STYLE_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "solo", label: "個人事業主・フリーランス" },
  { value: "corp", label: "法人経営" },
  { value: "side", label: "副業・複業が中心" },
  { value: "other", label: "その他" },
];

export const HM_FOCUS_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "child", label: "子育てが中心" },
  { value: "house", label: "家事が中心" },
  { value: "care", label: "介護・看護家族あり" },
  { value: "other", label: "その他" },
];

export const JS_OPTIONS: WorkLifeOption[] = [
  { value: "", label: "選ばない" },
  { value: "newgrad", label: "新卒就活中" },
  { value: "change", label: "転職活動中" },
  { value: "leave", label: "休職・療養" },
  { value: "gap", label: "ブランクがある" },
  { value: "other", label: "その他" },
];

function labelOf(options: WorkLifeOption[], value: string): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

const ALL_CAREER_OPTION_ROWS: WorkLifeOption[] = [
  ...CAREER_OPTIONS_GENERAL,
  ...CAREER_OPTIONS_STUDENT,
  ...CAREER_OPTIONS_JOB_SEEKING,
  ...CAREER_OPTIONS_HOMEMAKER,
];

/** 立場に応じた「本業・雇用」選択肢 */
export function careerOptionsForRole(role: string): WorkLifeOption[] {
  if (role === "student") return CAREER_OPTIONS_STUDENT;
  if (role === "job_seeking") return CAREER_OPTIONS_JOB_SEEKING;
  if (role === "homemaker") return CAREER_OPTIONS_HOMEMAKER;
  return CAREER_OPTIONS_GENERAL;
}

/** 保存値 → 表示ラベル（旧キー対応。同一 value がロールで文言が違うため role を優先） */
export function careerExperienceLabel(value: string, occupationRole = ""): string {
  if (!value) return "";
  if (value === "multi") return "本業として複数の職種や会社を経てきた";
  if (value === "ft") return "正社員・契約社員などの雇用で働いた";
  if (value === "one_plus") return "半年以上続けた経験がある";
  const fromRole = labelOf(careerOptionsForRole(occupationRole), value);
  if (fromRole !== value) return fromRole;
  const fromAll = labelOf(ALL_CAREER_OPTION_ROWS, value);
  return fromAll !== value ? fromAll : value;
}

export function parttimeExperienceLabel(value: string): string {
  if (!value) return "";
  // 旧保存値（concurrent 導入前の multi）の表示互換
  if (value === "multi") return "かつてしたことがある程度";
  return labelOf(PARTTIME_OPTIONS, value) || value;
}

export function parseMultiSelectStored(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  try {
    const a = JSON.parse(t) as unknown;
    if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    /* ignore */
  }
  return [];
}

export function encodeMultiSelectStored(values: string[]): string {
  const u = [...new Set(values.filter(Boolean))].sort();
  return u.length ? JSON.stringify(u) : "";
}

export function formatMultiOptionLabels(options: WorkLifeOption[], values: string[]): string {
  return values.map((v) => labelOf(options, v) || v).join("、");
}

/**
 * アルバイト経験（量・業種）を尋ねるロール。
 * 会社員・公務員・自営など本業で働いている人には尋ねない。
 */
export function roleAsksParttimeHistory(role: string): boolean {
  return !["company", "public_sector", "self_employed"].includes(role);
}

/** 会社員・公務員・自営など（本業で勤務している想定のロール） */
export function roleIsPaidProfessional(role: string): boolean {
  return ["company", "public_sector", "self_employed"].includes(role);
}

/**
 * 経歴ブロック。`omitHomePref` で `hi_home_pref` を外す（立場カードや学生の住まいと重複させない）。
 * 含める場合、会社員・公務員・自営は「いまの住まい」を先に、その他は 地域 → 出身県 → 住まい → …。
 */
function historyQuestions(opts: { omitHomePref: boolean; role: string }): WorkLifeQuestion[] {
  const originBlock: WorkLifeQuestion[] = [
    {
      id: "hi_origin",
      assistant: "育ちや出身に近い地域はどれですか？（任意・1つ）",
      options: ORIGIN_OPTIONS,
      logPrefix: "育ち・出身",
    },
    {
      id: "hi_origin_pref",
      assistant:
        "出身に近い都道府県を選んでください。（任意・1つ）さきほど選んだ広域に含まれる都道府県だけが表示されます。別の地方に当てはまる場合は、前の質問で広域を選び直してください。",
      options: PREFECTURE_OPTIONS,
      logPrefix: "出身（都道府県）",
    },
  ];

  const homePref: WorkLifeQuestion | null = opts.omitHomePref ? null : HI_HOME_PREF_QUESTION;

  const eduTail: WorkLifeQuestion[] = [];
  if (opts.role !== "student") {
    eduTail.push({
      id: "hi_edu",
      assistant: "いちばん近い学歴はどれですか？（任意・1つ）",
      options: EDU_LEVEL_OPTIONS,
      logPrefix: "学歴",
    });
  }

  if (roleAsksParttimeHistory(opts.role)) {
    eduTail.push(
      {
        id: "hi_part",
        assistant: "アルバイトやパートの経験に近いものはどれですか？（任意）",
        options: PARTTIME_OPTIONS,
        logPrefix: "アルバイト",
      },
      {
        id: "hi_pt_industry",
        assistant:
          "バイト・パートの内容に近いものを、チップから選んでください。（複数可。「その他」を選んだときは下の欄に書けます）",
        inputKind: "multi_chips",
        options: PARTTIME_INDUSTRY_OPTIONS,
        logPrefix: "バイト業種",
      },
    );
  }

  const paid = roleIsPaidProfessional(opts.role);
  if (paid && homePref) {
    return [homePref, ...originBlock, ...eduTail];
  }
  return [...originBlock, ...(homePref ? [homePref] : []), ...eduTail];
}

/**
 * 学生: 学校段階 → 学校名（検索）→ 住まいの形態 → 住まいの地域 → 通学 → 時間割（表）→ 経歴
 */
function studentQuestions(): WorkLifeQuestion[] {
  return [
    {
      id: "st_level",
      assistant: "学校の段階に近いものはどれですか？（任意・1つ）",
      options: ST_LEVEL_OPTIONS,
      logPrefix: "学校の段階",
    },
    {
      id: "st_school",
      assistant: "学校名を教えてください。（任意）",
      inputKind: "school",
      logPrefix: "学校",
    },
    {
      id: "st_univ_year",
      assistant: "学年・年次に近いものはどれですか？（大学・大学院生のみ。該当しない場合は選ばない）",
      options: ST_UNIV_YEAR_OPTIONS,
      logPrefix: "学年",
    },
    {
      id: "st_univ_field",
      assistant: "学部・学科・学問領域に近いものはどれですか？（大学・大学院生のみ。該当しない場合は選ばない）",
      options: ST_UNIV_FIELD_OPTIONS,
      logPrefix: "学問領域",
    },
    {
      id: "st_home_style",
      assistant: "いまの住まいに近いものはどれですか？（任意・1つ）",
      options: ST_HOME_STYLE_OPTIONS,
      logPrefix: "住まいの形態",
    },
    {
      id: "st_home_pref",
      assistant: "いま主に住んでいる都道府県に近いものはどれですか？（任意・1つ）",
      options: PREFECTURE_OPTIONS,
      logPrefix: "住まいの地域",
    },
    {
      id: "st_commute",
      assistant: "通学の所要時間や移動のイメージに近いものはどれですか？（任意・1つ）",
      options: COMMUTE_OPTIONS,
      logPrefix: "通学",
    },
    {
      id: "st_timetable_note",
      assistant: "時間割を表で入力してください（任意）。",
      inputKind: "timetable",
      logPrefix: "時間割",
    },
  ];
}

function companyQuestions(): WorkLifeQuestion[] {
  return [
    {
      id: "co_industry",
      assistant: "お仕事の業種に近いものはどれですか？（任意・1つ）",
      options: CO_INDUSTRY_OPTIONS,
      logPrefix: "業種",
    },
    {
      id: "co_style",
      assistant: "働き方に近いものはどれですか？（任意・1つ）",
      options: CO_STYLE_OPTIONS,
      logPrefix: "働き方",
    },
    {
      id: "co_commute",
      assistant: "通勤に近いイメージはどれですか？（任意・1つ）",
      options: COMMUTE_OPTIONS,
      logPrefix: "通勤",
    },
  ];
}

function publicSectorQuestions(): WorkLifeQuestion[] {
  return [
    {
      id: "ps_field",
      assistant: "分野に近いものはどれですか？（任意・1つ）",
      options: PS_FIELD_OPTIONS,
      logPrefix: "分野",
    },
    {
      id: "ps_commute",
      assistant: "通勤に近いイメージはどれですか？（任意・1つ）",
      options: COMMUTE_OPTIONS,
      logPrefix: "通勤",
    },
  ];
}

function selfEmployedQuestions(): WorkLifeQuestion[] {
  return [
    {
      id: "se_style",
      assistant: "活動の形に近いものはどれですか？（任意・1つ）",
      options: SE_STYLE_OPTIONS,
      logPrefix: "活動",
    },
    {
      id: "se_commute",
      assistant: "移動や通勤のイメージに近いものはどれですか？（任意・1つ）",
      options: COMMUTE_OPTIONS,
      logPrefix: "移動",
    },
  ];
}

/** 立場確定後に続く質問（1問ずつ表示） */
export function buildWorkLifeQuestionsAfterRole(role: string): WorkLifeQuestion[] {
  const histAll = historyQuestions({ omitHomePref: false, role });
  const histStudent = historyQuestions({ omitHomePref: true, role });
  if (!role || role === "other") {
    return histAll;
  }
  if (role === "student") {
    return [...studentQuestions(), ...histStudent];
  }
  if (role === "company") {
    return [...companyQuestions(), ...histAll];
  }
  if (role === "public_sector") {
    return [...publicSectorQuestions(), ...histAll];
  }
  if (role === "self_employed") {
    return [...selfEmployedQuestions(), ...histAll];
  }
  if (role === "homemaker") {
    return [
      {
        id: "hm_focus",
        assistant: "いま中心になっていることに近いものはどれですか？（任意・1つ）",
        options: HM_FOCUS_OPTIONS,
        logPrefix: "中心",
      },
      HI_HOME_PREF_QUESTION,
      ...historyQuestions({ omitHomePref: true, role }),
    ];
  }
  if (role === "job_seeking") {
    return [
      {
        id: "js_situation",
        assistant: "いまの状況に近いものはどれですか？（任意・1つ）",
        options: JS_OPTIONS,
        logPrefix: "状況",
      },
      HI_HOME_PREF_QUESTION,
      ...historyQuestions({ omitHomePref: true, role }),
    ];
  }
  return histAll;
}

export function optionLabelForQuestion(q: WorkLifeQuestion, value: string): string {
  if (q.inputKind === "multi_chips" || (q.inputKind === "multi_select" && q.id === "hi_pt_industry")) {
    const { tags, free } = parseParttimeIndustryStored(value);
    if (!tags.length && !free.trim()) return "（選ばない）";
    return formatParttimeIndustryLine(tags, free);
  }
  if (q.inputKind === "multi_select") {
    const vals = parseMultiSelectStored(value);
    if (!vals.length) return "（選ばない）";
    return formatMultiOptionLabels(q.options ?? [], vals);
  }
  if (!q.options) return value;
  return labelOf(q.options, value);
}

/** ログ1行分のラベル */
export function formatWorkDetailUserLine(q: WorkLifeQuestion, storedValue: string): string {
  if (q.inputKind === "multi_chips" || (q.inputKind === "multi_select" && q.id === "hi_pt_industry")) {
    const { tags, free } = parseParttimeIndustryStored(storedValue);
    if (!tags.length && !free.trim()) return `${q.logPrefix}: （選ばない）`;
    return `${q.logPrefix}: ${formatParttimeIndustryLine(tags, free)}`;
  }
  if (q.inputKind === "multi_select") {
    const vals = parseMultiSelectStored(storedValue);
    if (!vals.length) return `${q.logPrefix}: （選ばない）`;
    return `${q.logPrefix}: ${formatMultiOptionLabels(q.options ?? [], vals)}`;
  }
  if (q.inputKind === "school") {
    const lab = schoolWorkAnswerToLabel(storedValue);
    return lab ? `${q.logPrefix}: ${lab}` : `${q.logPrefix}: （選ばない）`;
  }
  if (q.inputKind === "short_text") {
    const t = storedValue.trim();
    return t ? `${q.logPrefix}: ${t.length > 100 ? `${t.slice(0, 100)}…` : t}` : `${q.logPrefix}: （なし）`;
  }
  if (q.inputKind === "timetable") {
    const sum = formatTimetableSummary(storedValue);
    if (!sum) return `${q.logPrefix}: （なし）`;
    const short = sum.length > 140 ? `${sum.slice(0, 140)}…` : sum;
    return `${q.logPrefix}: ${short}`;
  }
  return storedValue
    ? `${q.logPrefix}: ${optionLabelForQuestion(q, storedValue)}`
    : `${q.logPrefix}: （選ばない）`;
}

/** 経歴・出身・住まい（都道府県）を `education` 用1行に */
export function composeHistoryEducationLine(answers: Record<string, string>, occupationRole = ""): string {
  const hi: string[] = [];
  const ho = answers.hi_origin ? labelOf(ORIGIN_OPTIONS, answers.hi_origin) : "";
  const hop = answers.hi_origin_pref ? labelOf(PREFECTURE_OPTIONS, answers.hi_origin_pref) : "";
  const hh = answers.hi_home_pref ? labelOf(PREFECTURE_OPTIONS, answers.hi_home_pref) : "";
  const he = answers.hi_edu ? labelOf(EDU_LEVEL_OPTIONS, answers.hi_edu) : "";
  const hp = answers.hi_part ? parttimeExperienceLabel(answers.hi_part) : "";
  const pt = parseParttimeIndustryStored(answers.hi_pt_industry ?? "");
  const ptIndStr = pt.tags.length || pt.free.trim() ? formatParttimeIndustryLine(pt.tags, pt.free) : "";
  const hc = answers.hi_career ? careerExperienceLabel(answers.hi_career, occupationRole) : "";
  if (ho) hi.push(`育ち・出身: ${ho}`);
  if (hop) hi.push(`出身（都道府県）: ${hop}`);
  if (hh) hi.push(`いまの住まい（都道府県）: ${hh}`);
  if (he) hi.push(`学歴: ${he}`);
  if (hp) hi.push(`アルバイト: ${hp}`);
  if (ptIndStr) hi.push(`バイト業種: ${ptIndStr}`);
  if (hc) hi.push(`勤務・雇用: ${hc}`);
  return hi.join(" / ");
}

/** 選択結果を既存プロフィール文字列に落とし込む */
export function composeWorkLifePayload(
  role: string,
  answers: Record<string, string>,
): { occupationNote: string; studentLifeNotes: string; education: string } {
  const occ: string[] = [];
  const st: string[] = [];

  if (role === "student") {
    const line = composeStudentLifeNotesLine(answers);
    if (line) st.push(line);
  } else if (role === "company") {
    const a = answers.co_industry ? labelOf(CO_INDUSTRY_OPTIONS, answers.co_industry) : "";
    const b = answers.co_style ? labelOf(CO_STYLE_OPTIONS, answers.co_style) : "";
    const c = answers.co_commute ? labelOf(COMMUTE_OPTIONS, answers.co_commute) : "";
    if (a) occ.push(`業種: ${a}`);
    if (b) occ.push(`働き方: ${b}`);
    if (c) occ.push(`通勤: ${c}`);
  } else if (role === "public_sector") {
    const a = answers.ps_field ? labelOf(PS_FIELD_OPTIONS, answers.ps_field) : "";
    const b = answers.ps_commute ? labelOf(COMMUTE_OPTIONS, answers.ps_commute) : "";
    if (a) occ.push(`分野: ${a}`);
    if (b) occ.push(`通勤: ${b}`);
  } else if (role === "self_employed") {
    const a = answers.se_style ? labelOf(SE_STYLE_OPTIONS, answers.se_style) : "";
    const b = answers.se_commute ? labelOf(COMMUTE_OPTIONS, answers.se_commute) : "";
    if (a) occ.push(`活動: ${a}`);
    if (b) occ.push(`移動: ${b}`);
  } else if (role === "homemaker") {
    const a = answers.hm_focus ? labelOf(HM_FOCUS_OPTIONS, answers.hm_focus) : "";
    if (a) occ.push(`中心: ${a}`);
  } else if (role === "job_seeking") {
    const a = answers.js_situation ? labelOf(JS_OPTIONS, answers.js_situation) : "";
    if (a) occ.push(`状況: ${a}`);
  }

  const education = composeHistoryEducationLine(answers, role);

  return {
    occupationNote: occ.join(" / "),
    studentLifeNotes: st.join(" / "),
    education,
  };
}
