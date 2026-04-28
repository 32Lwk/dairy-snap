import type { Prisma } from "@/generated/prisma/client";
import { formatAgentPersonaForPrompt } from "@/lib/agent-persona-preferences";
import { ageYearsFromYmd, sanitizeHtmlDateYmd } from "@/lib/age-from-ymd";
import { formatInterestPicksForPrompt } from "@/lib/interest-taxonomy";
import { labelForOccupationRole } from "@/lib/occupation-role";
import { isLoveMbtiType, loveMbtiDisplayJa, loveMbtiUserPromptSubLines } from "@/lib/love-mbti";
import { isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import { formatTimetableForPrompt, formatTimetableForPromptDaySlice } from "@/lib/timetable";

export type DefaultWeatherLocation = {
  latitude: number;
  longitude: number;
  label?: string;
};

/** プロフィール（settings JSON の profile に保存。任意項目のみ） */
export type UserProfileSettings = {
  /** 表示用ニックネーム（OAuth の name とは別） */
  nickname?: string;
  /** YYYY-MM-DD */
  birthDate?: string;
  /** 星座（生年月日から自動。手編集は上書きされうる） */
  zodiac?: string;
  /** A / B / O / AB / 不明 など */
  bloodType?: string;
  /** female / male / nonbinary / no_answer / other など */
  gender?: string;
  /** 職業・立場の区分（student / company など） */
  occupationRole?: string;
  /** 職種・部署など短い補足 */
  occupationNote?: string;
  /** 学生向け: 学校名・所在地・通学・居住・時間割のメモ */
  studentLifeNotes?: string;
  /** 出身地・学歴・職歴・アルバイトなど */
  education?: string;
  /** 16タイプ英字（INTJ など） */
  mbti?: string;
  /** 恋愛キャラ16タイプ英字（LCRO など。従来の INTJ 等とは別分類） */
  loveMbti?: string;
  /** 趣味（自由記述・補足） */
  hobbies?: string;
  /** 嗜好・関心（自由記述・補足） */
  interests?: string;
  /** 階層タグ `category:sub` の配列 */
  interestPicks?: string[];
  /** 好み・メモ */
  preferences?: string;
  /** 初回オンボーディング完了（スキップ含む） */
  onboardingCompletedAt?: string;
  /** AI 呼び方（agent-persona-preferences の値） */
  aiAddressStyle?: string;
  /** AI の話し方トーン */
  aiChatTone?: string;
  /** 掘り下げの深さ */
  aiDepthLevel?: string;
  /** いちばん元気な時間帯 */
  aiEnergyPeak?: string;
  /** 忙しめの時間帯（複数） */
  aiBusyWindows?: string[];
  /** 避けたい話題（複数。「none」で特になし） */
  aiAvoidTopics?: string[];
  /** いま関心が高いもの（複数） */
  aiCurrentFocus?: string[];
  /** 健康の話題の扱い */
  aiHealthComfort?: string;
  /** 暮らしのざっくり */
  aiHousehold?: string;
  /** MAS: how much to store/recall memories */
  aiMemoryRecallStyle?: string;
  /** MAS: proper names in memory */
  aiMemoryNamePolicy?: string;
  /** MAS: how strongly to update/delete on contradiction */
  aiMemoryForgetBias?: string;
  /**
   * 時間割エディタの完全データ（`TT_JSON_V1:` 接頭辞付き JSON）。
   * 曜日列・各限・開始時刻・コマ長・セル内容を欠損なく保持する。
   */
  studentTimetable?: string;
  /**
   * 職業・暮らしウィザードの回答スナップショット（`st_timetable_note` は含めない。studentTimetable を参照）
   */
  workLifeAnswers?: Record<string, string>;

  /**
   * 開口メッセージの話題優先順位・分類ルール（任意）。
   * Googleカレンダー予定をどのカテゴリとして扱うかの重み付けに使う。
   */
  calendarOpening?: CalendarOpeningSettings;

  /**
   * AIの誤推測をユーザーが訂正したメモ（短い箇条書き）。
   * 「たぶん〜」のような推測を訂正されたら追加し、次回以降の会話で参照する。
   */
  aiCorrections?: string[];
};

export const CALENDAR_OPENING_USERCAT_PREFIX = "usercat:" as const;

export const CALENDAR_OPENING_BUILTIN_IDS = [
  "job_hunt",
  "parttime",
  "date",
  "school",
  "health",
  "family",
  "birthday",
  "hobby",
  "other",
] as const;

export type BuiltinCalendarOpeningCategory = (typeof CALENDAR_OPENING_BUILTIN_IDS)[number];

/** 組み込み9種 + ユーザー追加（`usercat:` + スラッグ） */
export type CalendarOpeningCategory = BuiltinCalendarOpeningCategory | `usercat:${string}`;

export const CALENDAR_OPENING_BUILTIN_CATS: { id: BuiltinCalendarOpeningCategory; label: string }[] = [
  { id: "job_hunt", label: "就活/面接" },
  { id: "parttime", label: "バイト/シフト" },
  { id: "date", label: "デート/恋愛" },
  { id: "school", label: "授業/試験" },
  { id: "health", label: "通院/健康" },
  { id: "family", label: "家族/友人" },
  { id: "birthday", label: "誕生日/記念日" },
  { id: "hobby", label: "趣味/イベント" },
  { id: "other", label: "その他" },
];

/**
 * 開口インパクトのおすすめ倍率（組み込みカテゴリのみ）。
 * 授業・就活・記念日・通院などをやや強め、バイト・家族・趣味は控えめに上げる想定。
 */
export const RECOMMENDED_CALENDAR_OPENING_CATEGORY_IMPACT_MULTIPLIERS: Partial<
  Record<BuiltinCalendarOpeningCategory, number>
> = {
  school: 1.5,
  job_hunt: 1.35,
  birthday: 1.35,
  health: 1.25,
  date: 1.2,
  parttime: 1.15,
  family: 1.1,
  hobby: 1.1,
};

/**
 * 既存の倍率に、おすすめプリセット（上表のキーのみ）を上書きマージする。
 * カスタムカテゴリ（usercat:*）や、プリセットに無い組み込みカテゴリの値はそのまま残す。
 */
export function mergeRecommendedCalendarOpeningImpactMultipliers(
  existing: Partial<Record<CalendarOpeningCategory, number>> | undefined,
): CalendarOpeningSettings["categoryMultiplierById"] {
  const base = { ...(existing ?? {}) } as Record<string, number>;
  for (const [id, rec] of Object.entries(RECOMMENDED_CALENDAR_OPENING_CATEGORY_IMPACT_MULTIPLIERS)) {
    if (typeof rec !== "number" || !Number.isFinite(rec)) continue;
    const clamped = Math.max(0.2, Math.min(3, rec));
    if (Math.abs(clamped - 1) < 1e-9) delete base[id];
    else base[id] = clamped;
  }
  if (Object.keys(base).length === 0) return undefined;
  return base as Partial<Record<CalendarOpeningCategory, number>>;
}

const CAL_USERCAT_ID_RE = /^usercat:[a-z0-9_]{1,32}$/;

/** 表示ラベルから安定したカテゴリ ID を生成（保存・ルール参照に使う） */
export function labelToUserCategoryId(label: string): CalendarOpeningCategory {
  const t = label.normalize("NFKC").trim().toLowerCase();
  const slug = t
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  const s = slug.length > 0 ? slug : "custom";
  return `${CALENDAR_OPENING_USERCAT_PREFIX}${s}` as CalendarOpeningCategory;
}

export type CalendarOpeningRuleKind =
  | "keyword"
  | "calendarId"
  | "colorId"
  | "location"
  | "description";

export type CalendarOpeningRule = {
  kind: CalendarOpeningRuleKind;
  /** kindに応じた一致キー（部分一致/正規表現は当面なし） */
  value: string;
  category: CalendarOpeningCategory;
  /** -20..+20 程度（任意。未指定は +5） */
  weight?: number;
};

/** JS と同じ: 0=日曜 … 6=土曜。グリッド左端の列がこの曜日になる */
export type CalendarWeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 月カレンダー・今日の予定リストの見た目（表示のみ） */
export type CalendarGridDisplaySettings = {
  weekStartsOn?: CalendarWeekStartDay;
  /** 月グリッドの各マスに並べる予定の最大件数（1〜5） */
  maxEventsPerCell?: number;
  /** カレンダー ID → #rrggbb（ユーザー上書き） */
  calendarHexById?: Record<string, string>;
};

export type CalendarOpeningSettings = {
  /** 優先順位（並べ替え）。未設定ならデフォルト順を使う */
  priorityOrder?: CalendarOpeningCategory[];
  /** 追加ルール */
  rules?: CalendarOpeningRule[];
  /** ユーザー定義カテゴリ（表示名。内部 ID は labelToUserCategoryId で決定） */
  customCategoryLabels?: string[];
  /**
   * 開口トピックのカテゴリ別倍率（インパクト側）。
   * - 例: { school: 1.4, parttime: 1.15 }
   * - 1.0 は保存しない（未設定扱い）
   */
  categoryMultiplierById?: Partial<Record<CalendarOpeningCategory, number>>;
  /** Google カレンダー ID → 分類デフォルト（ルール・キーワードより強く効かせる） */
  calendarCategoryById?: Record<string, CalendarOpeningCategory>;
  /** Google カレンダー ID → このアプリ内だけの表示名（Google 側の名前は変えない） */
  calendarDisplayLabelById?: Record<string, string>;
  /** カレンダー画面のグリッド表示オプション */
  gridDisplay?: CalendarGridDisplaySettings;
};

/**
 * `calendarCategoryById` のスコア加算。値が大きいと本文・カレンダー名ヒントより常に勝ち「趣味」等に張り付きやすい。
 * 明示の calendarId ルール（CALENDAR_ID_RULE_STRONG_WEIGHT）より弱くする。
 */
export const CALENDAR_DEFAULT_CATEGORY_WEIGHT = 52;

/** kind:calendarId でこの ID の予定をカテゴリに強く寄せるときの重み（既定カテゴリより強い）。 */
export const CALENDAR_ID_RULE_STRONG_WEIGHT = 96;

/**
 * カレンダー表示名が勤務・シフト系のときの parttime ブースト（誤った hobby 既定より強く効かせる）。
 */
export const PARTTIME_CALENDAR_NAME_SCORE_BOOST = 72;

/** Display name looks birthday/anniversary-themed: per-event boost toward `birthday`. */
export const BIRTHDAY_CALENDAR_NAME_SCORE_BOOST = 58;

/** Display name suggests coursework / campus in the calendar title. Per-event boost toward school. */
export const SCHOOL_CALENDAR_NAME_SCORE_BOOST = 56;

const BIRTHDAY_CALENDAR_NAME_KEYWORDS = [
  "\u8a95\u751f\u65e5",
  "\u304a\u8a95\u751f\u65e5",
  "birthday",
  "\u30d0\u30fc\u30b9\u30c7\u30fc",
  "\u8a18\u5ff5\u65e5",
  "anniversary",
  "bday",
  "\u9023\u7d61\u5148",
  "contact",
  "contacts",
  "\ud83c\udf82",
] as const;

const PARTTIME_CALENDAR_NAME_KEYWORDS = [
  "シフト",
  "シフトボード",
  "シフト表",
  "バイト",
  "アルバイト",
  "勤務表",
  "出勤",
  "退勤",
  "勤務",
  "勤怠",
  "就業",
  "\u52b4\u50cd",
  "shift",
  "part-time",
  "parttime",
] as const;

const SCHOOL_CALENDAR_NAME_KEYWORDS = [
  "\u8ab2\u984c",
  "\u63d0\u51fa",
  "\u30ec\u30dd\u30fc\u30c8",
  "\u5927\u5b66",
  "\u30bc\u30df",
  "\u6388\u696d",
  "\u8b1b\u7fa9",
  "\u8a66\u9a13",
  "\u5358\u4f4d",
  "\u5b66\u52d9",
  "\u7de0\u5207",
  "\u5c65\u4fee",
  "\u30b7\u30e9\u30d0\u30b9",
  "assignment",
  "deadline",
  "homework",
  "report",
] as const;

/** カレンダー名（設定・同期キャッシュの表示名）からバイト/シフト向きか */
export function suggestsParttimeCalendarName(name: string | null | undefined): boolean {
  const n = (name ?? "").normalize("NFKC").trim().toLowerCase();
  if (!n) return false;
  for (const k of PARTTIME_CALENDAR_NAME_KEYWORDS) {
    if (n.includes(k.toLowerCase())) return true;
  }
  return false;
}

/** Heuristic: calendar summary/title suggests birthdays or anniversaries. */
export function suggestsBirthdayCalendarName(name: string | null | undefined): boolean {
  const n = (name ?? "").normalize("NFKC").trim().toLowerCase();
  if (!n) return false;
  for (const k of BIRTHDAY_CALENDAR_NAME_KEYWORDS) {
    const kk = k.toLowerCase();
    if (n.includes(kk)) return true;
  }
  return false;
}

/** Heuristic: calendar name suggests coursework / campus life (not generic import label alone). */
export function suggestsSchoolCalendarName(name: string | null | undefined): boolean {
  const n = (name ?? "").normalize("NFKC").trim().toLowerCase();
  if (!n) return false;
  for (const k of SCHOOL_CALENDAR_NAME_KEYWORDS) {
    if (n.includes(k.toLowerCase())) return true;
  }
  return false;
}

/** calendarIdキーの表記ゆれ（URL エンコード等）に対するフォールバック付き参照。 */
function lookupCalendarIdRecordValue<T>(
  map: Record<string, T> | undefined,
  calendarId: string,
  isPresent: (v: T) => boolean,
): T | undefined {
  if (!map) return undefined;
  const id = calendarId.trim();
  if (!id) return undefined;
  const direct = map[id];
  if (isPresent(direct as T)) return direct;
  let decoded: string | null = null;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    decoded = null;
  }
  if (decoded && decoded !== id) {
    const v = map[decoded];
    if (isPresent(v as T)) return v;
  }
  try {
    const enc = encodeURIComponent(id);
    if (enc !== id) {
      const v = map[enc];
      if (isPresent(v as T)) return v;
    }
  } catch {
    /* ignore */
  }
  const lower = id.toLowerCase();
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === lower) return map[k];
  }
  return undefined;
}

/** calendarCategoryById のキーが URL エンコード等でイベント側 ID とずれる場合のフォールバック付き参照。 */
export function lookupCalendarCategoryById(
  map: Record<string, CalendarOpeningCategory> | undefined,
  calendarId: string,
): CalendarOpeningCategory | undefined {
  return lookupCalendarIdRecordValue(map, calendarId, (v) => typeof v === "string" && v.length > 0);
}

/** アプリ内表示名の上書き（calendarDisplayLabelById）の参照。 */
export function lookupCalendarDisplayLabelById(
  map: Record<string, string> | undefined,
  calendarId: string,
): string | undefined {
  const v = lookupCalendarIdRecordValue(map, calendarId, (x) => typeof x === "string" && x.trim().length > 0);
  return typeof v === "string" ? v.trim() : undefined;
}

export function resolveCalendarDisplayNameForUser(
  calendarId: string,
  sourceName: string,
  labels: Record<string, string> | undefined,
): string {
  const custom = lookupCalendarDisplayLabelById(labels, calendarId);
  if (custom) return custom;
  return sourceName;
}

/**
 * 保存済みカレンダー既定をスコアに載せる直前に正す。
 * 「シフトボード」等なのに過去の自動推定で hobby が残っている不整合を parttime に寄せる。
 */
export function resolveCalendarDefaultCategoryForScoring(
  calendarId: string | undefined,
  calendarName: string | undefined,
  map: Record<string, CalendarOpeningCategory> | undefined,
): CalendarOpeningCategory | undefined {
  const raw = lookupCalendarCategoryById(map, calendarId ?? "");
  if (raw === "hobby" && suggestsParttimeCalendarName(calendarName)) return "parttime";
  if (raw === "hobby" && suggestsSchoolCalendarName(calendarName)) return "school";
  if (raw === "hobby" && suggestsBirthdayCalendarName(calendarName)) return "birthday";
  return raw;
}

/**
 * この calendarId を「バイト/シフト」に寄せるルールを追加（または強度更新）し、同じ ID のカレンダー既定は外す。
 * import で大学・店舗などが混在するカレンダーでは万能ではないが、表示名がシフトっぽくない場合のワンクリック用。
 */
export function upsertCalendarIdParttimeRule(
  opening: CalendarOpeningSettings,
  calendarId: string,
): CalendarOpeningSettings {
  const id = calendarId.trim();
  if (!id) return opening;
  const rules = [...(opening.rules ?? [])];
  const idx = rules.findIndex((r) => r.kind === "calendarId" && r.value === id && r.category === "parttime");
  const row: CalendarOpeningRule = {
    kind: "calendarId",
    value: id,
    category: "parttime",
    weight: CALENDAR_ID_RULE_STRONG_WEIGHT,
  };
  if (idx >= 0) rules[idx] = row;
  else rules.push(row);

  const next: CalendarOpeningSettings = { ...opening, rules };
  const map = { ...(opening.calendarCategoryById ?? {}) };
  delete map[id];
  if (Object.keys(map).length > 0) next.calendarCategoryById = map;
  else delete next.calendarCategoryById;
  return next;
}

const CALENDAR_OPENING_BUILTIN_TEXT_HINTS: { cat: BuiltinCalendarOpeningCategory; words: string[]; w: number }[] = [
  { cat: "job_hunt", words: ["\u9762\u63a5", "ES", "\u8aac\u660e\u4f1a", "\u9078\u8003", "\u5185\u5b9a", "\u30a4\u30f3\u30bf\u30fc\u30f3", "\u9762\u8ac7", "\u30ea\u30af\u30eb\u30fc\u30bf\u30fc"], w: 6 },
  { cat: "parttime", words: ["\u30d0\u30a4\u30c8", "\u30a2\u30eb\u30d0\u30a4\u30c8", "\u30b7\u30d5\u30c8", "\u51fa\u52e4", "\u9000\u52e4", "\u52e4\u52d9", "\u30ec\u30b8"], w: 6 },
  {
    cat: "date",
    words: ["\u30c7\u30fc\u30c8", "\u5f7c\u6c0f", "\u5f7c\u5973", "\u4ea4\u969b", "\u544a\u767d", "\u7d50\u5a5a\u8a18\u5ff5\u65e5"],
    w: 6,
  },
  {
    cat: "birthday",
    words: [
      "\u8a95\u751f\u65e5",
      "\u304a\u8a95\u751f\u65e5",
      "\u30d0\u30fc\u30b9\u30c7\u30fc",
      "birthday",
      "\u751f\u8a95",
      "\ud83c\udf82",
    ],
    w: 7,
  },
  {
    cat: "school",
    words: [
      "\u8b1b\u7fa9",
      "\u6388\u696d",
      "\u30bc\u30df",
      "\u8a66\u9a13",
      "\u30c6\u30b9\u30c8",
      "\u30ec\u30dd\u30fc\u30c8",
      "\u8ab2\u984c",
      "\u63d0\u51fa",
      "\u767a\u8868",
    ],
    w: 6,
  },
  { cat: "health", words: ["\u75c5\u9662", "\u901a\u9662", "\u6b6f\u533b\u8005", "\u30af\u30ea\u30cb\u30c3\u30af", "\u691c\u8a3a", "\u85ac"], w: 6 },
  { cat: "family", words: ["\u5e30\u7701", "\u5bb6\u65cf", "\u53cb\u9054", "\u53cb\u4eba", "\u98f2\u307f\u4f1a", "\u540c\u7a93\u4f1a"], w: 4 },
];

/** Markers that suggest school context (extra school bump in builtin text hints). */
const ACADEMIC_CONTEXT_MARKERS = [
  "\u8ab2\u984c",
  "\u63d0\u51fa",
  "\u30ec\u30dd\u30fc\u30c8",
  "\u5927\u5b66",
  "\u30bc\u30df",
  "\u6388\u696d",
  "\u8b1b\u7fa9",
  "\u8a66\u9a13",
  "\u5358\u4f4d",
  "\u5b66\u52d9",
  "\u7de0\u5207",
  "\u671f\u672b",
  "\u671f\u4e2d",
  "\u5c65\u4fee",
  "\u30b7\u30e9\u30d0\u30b9",
  "assignment",
  "deadline",
  "homework",
  "midterm",
  "final",
] as const;

/** Title / location / description keyword hints when classification rules are empty (opening scorer family). */
export function addCalendarOpeningBuiltinTextHints(
  haystack: string,
  bump: (cat: CalendarOpeningCategory, w: number) => void,
): void {
  const hay = haystack.toLowerCase();
  const acc = new Map<CalendarOpeningCategory, number>();
  const add = (cat: CalendarOpeningCategory, w: number) => {
    acc.set(cat, (acc.get(cat) ?? 0) + w);
  };
  for (const b of CALENDAR_OPENING_BUILTIN_TEXT_HINTS) {
    for (const w of b.words) {
      if (hay.includes(w.toLowerCase())) add(b.cat, b.w);
    }
  }
  const hasAcademic = ACADEMIC_CONTEXT_MARKERS.some((k) => hay.includes(k.toLowerCase()));
  if (hasAcademic) add("school", 5);
  for (const [cat, w] of acc) {
    if (w !== 0) bump(cat, w);
  }
}

/** 最高点を全体スコアから選び、同点は priority 順（早いほど優先）でタイブレーク */
export function pickWinningCalendarCategory(
  scores: Map<CalendarOpeningCategory, number>,
  priority: CalendarOpeningCategory[],
): CalendarOpeningCategory {
  if (scores.size === 0) return "other";
  let maxS = Number.NEGATIVE_INFINITY;
  for (const s of scores.values()) {
    if (s > maxS) maxS = s;
  }
  const rank = new Map<CalendarOpeningCategory, number>();
  priority.forEach((c, i) => rank.set(c, i));
  const notInPrio = 10_000;
  let best: CalendarOpeningCategory = "other";
  let bestRank = Number.POSITIVE_INFINITY;
  for (const [cat, s] of scores) {
    if (s < maxS) continue;
    const r = rank.get(cat) ?? notInPrio;
    if (r < bestRank || (r === bestRank && cat.localeCompare(best) < 0)) {
      bestRank = r;
      best = cat;
    }
  }
  return best;
}

export function normalizeCalendarGridDisplay(
  g: CalendarGridDisplaySettings | null | undefined,
): { weekStartsOn: CalendarWeekStartDay; maxEventsPerCell: number; calendarHexById: Record<string, string> } {
  const rawWs = g?.weekStartsOn;
  const weekStartsOn: CalendarWeekStartDay =
    typeof rawWs === "number" && Number.isInteger(rawWs) && rawWs >= 0 && rawWs <= 6
      ? (rawWs as CalendarWeekStartDay)
      : 0;
  const raw = g?.maxEventsPerCell;
  const maxEventsPerCell =
    typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : 2;
  const src = g?.calendarHexById;
  const calendarHexById: Record<string, string> = {};
  if (src && typeof src === "object" && !Array.isArray(src)) {
    let n = 0;
    for (const [k, v] of Object.entries(src)) {
      if (n >= 40) break;
      if (k.length > 400 || typeof v !== "string") continue;
      const hex = v.trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) continue;
      calendarHexById[k] = hex.toLowerCase();
      n++;
    }
  }
  return { weekStartsOn, maxEventsPerCell, calendarHexById };
}

export function calendarOpeningCategoryOptions(
  opening: CalendarOpeningSettings | null | undefined,
): { id: CalendarOpeningCategory; label: string; custom: boolean }[] {
  const builtins = CALENDAR_OPENING_BUILTIN_CATS.map((c) => ({ ...c, custom: false as const }));
  const seen = new Set<string>(builtins.map((b) => b.id));
  const out: { id: CalendarOpeningCategory; label: string; custom: boolean }[] = [...builtins];
  for (const lab of opening?.customCategoryLabels ?? []) {
    if (typeof lab !== "string") continue;
    const trimmed = lab.normalize("NFKC").trim();
    if (!trimmed) continue;
    const id = labelToUserCategoryId(trimmed);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: trimmed, custom: true });
  }
  return out;
}

/** 組み込み + カスタムのデフォルト優先順（全件） */
function defaultCalendarOpeningPriorityOrder(
  opening: CalendarOpeningSettings | null | undefined,
): CalendarOpeningCategory[] {
  const builtins = [...CALENDAR_OPENING_BUILTIN_IDS] as CalendarOpeningCategory[];
  const customIds = (opening?.customCategoryLabels ?? []).map((l) => labelToUserCategoryId(l));
  const uniq: CalendarOpeningCategory[] = [];
  const push = (x: CalendarOpeningCategory) => {
    if (!uniq.includes(x)) uniq.push(x);
  };
  for (const x of builtins) push(x);
  for (const x of customIds) push(x);
  return uniq.slice(0, 32);
}

/**
 * 優先順位配列を正規化（最大32件）。
 * - `priorityOrder` 未設定: 組み込み + カスタムをすべて含む従来のデフォルト順
 * - 設定済み: 保存された順のみ（行削除でカテゴリを優先対象から外せる）
 */
export function normalizeCalendarOpeningPriorityOrder(
  opening: CalendarOpeningSettings | null | undefined,
): CalendarOpeningCategory[] {
  const builtins = [...CALENDAR_OPENING_BUILTIN_IDS] as CalendarOpeningCategory[];
  const customIds = (opening?.customCategoryLabels ?? []).map((l) => labelToUserCategoryId(l));
  const allow = new Set<string>([...builtins, ...customIds]);
  const po = opening?.priorityOrder;

  if (po === undefined) {
    return defaultCalendarOpeningPriorityOrder(opening);
  }

  const filtered = po.filter((x): x is CalendarOpeningCategory => typeof x === "string" && allow.has(x));
  const uniq: CalendarOpeningCategory[] = [];
  for (const x of filtered) {
    if (!uniq.includes(x)) uniq.push(x);
  }

  if (uniq.length === 0) {
    return defaultCalendarOpeningPriorityOrder(opening);
  }

  return uniq.slice(0, 32);
}

export function stripCalendarOpeningCustomLabel(
  opening: CalendarOpeningSettings,
  label: string,
): CalendarOpeningSettings {
  const id = labelToUserCategoryId(label);
  const nextLabels = (opening.customCategoryLabels ?? []).filter((l) => labelToUserCategoryId(l) !== id);
  const nextPo = (opening.priorityOrder ?? []).filter((c) => c !== id);
  const nextRules = (opening.rules ?? []).filter((r) => r.category !== id);
  const prevMult = opening.categoryMultiplierById ?? {};
  const nextMult = Object.fromEntries(Object.entries(prevMult).filter(([k]) => k !== id)) as Partial<
    Record<CalendarOpeningCategory, number>
  >;
  const prevCalCat = opening.calendarCategoryById;
  const nextCalCat =
    prevCalCat && Object.keys(prevCalCat).length > 0
      ? Object.fromEntries(Object.entries(prevCalCat).filter(([, c]) => c !== id))
      : undefined;
  const out: CalendarOpeningSettings = { ...opening };
  if (nextLabels.length) out.customCategoryLabels = nextLabels;
  else delete out.customCategoryLabels;
  if (nextPo.length) out.priorityOrder = nextPo;
  else delete out.priorityOrder;
  if (nextRules.length) out.rules = nextRules;
  else delete out.rules;
  if (Object.keys(nextMult).length) out.categoryMultiplierById = nextMult;
  else delete out.categoryMultiplierById;
  if (nextCalCat && Object.keys(nextCalCat).length > 0) out.calendarCategoryById = nextCalCat;
  else delete out.calendarCategoryById;
  return out;
}

export type AppUserSettings = {
  defaultWeatherLocation?: DefaultWeatherLocation;
  profile?: UserProfileSettings;
};

function parseDefaultWeatherLocation(raw: unknown): DefaultWeatherLocation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const loc = raw as Record<string, unknown>;
  const lat = typeof loc.latitude === "number" ? loc.latitude : Number(loc.latitude);
  const lon = typeof loc.longitude === "number" ? loc.longitude : Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }
  const label = typeof loc.label === "string" ? loc.label : undefined;
  return {
    latitude: lat,
    longitude: lon,
    ...(label ? { label } : {}),
  };
}

function parseInterestPicks(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}

function parseProfileStringArray(raw: unknown, maxItemLen = 80, maxItems = 32): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= maxItemLen)
    .slice(0, maxItems);
  return out.length > 0 ? out : undefined;
}

const MAX_TIMETABLE_STORED = 120_000;

function parseWorkLifeAnswers(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.length > 64) continue;
    if (typeof v === "string" && v.length > 0 && v.length <= 12_000) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseCalendarOpening(raw: unknown): CalendarOpeningSettings | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const builtinCat = new Set<string>(CALENDAR_OPENING_BUILTIN_IDS);
  const allowedKind = new Set<CalendarOpeningRuleKind>([
    "keyword",
    "calendarId",
    "colorId",
    "location",
    "description",
  ]);

  const MAX_CUSTOM_LABELS = 16;
  const MAX_LABEL_LEN = 24;

  let customCategoryLabels: string[] | undefined;
  if (Array.isArray(o.customCategoryLabels)) {
    const seenId = new Set<string>();
    const labs: string[] = [];
    for (const x of o.customCategoryLabels) {
      if (typeof x !== "string") continue;
      const lab = x.normalize("NFKC").trim().slice(0, MAX_LABEL_LEN);
      if (!lab) continue;
      const id = labelToUserCategoryId(lab);
      if (seenId.has(id)) continue;
      seenId.add(id);
      labs.push(lab);
      if (labs.length >= MAX_CUSTOM_LABELS) break;
    }
    if (labs.length) customCategoryLabels = labs;
  }

  const customIds = new Set((customCategoryLabels ?? []).map((l) => labelToUserCategoryId(l)));
  const isAllowedCategory = (cat: string): cat is CalendarOpeningCategory => {
    if (builtinCat.has(cat)) return true;
    if (!CAL_USERCAT_ID_RE.test(cat)) return false;
    return customIds.has(cat as CalendarOpeningCategory);
  };

  let priorityOrder: CalendarOpeningCategory[] | undefined;
  if (Array.isArray(o.priorityOrder)) {
    const po = o.priorityOrder
      .map((x) => {
        if (typeof x !== "string") return x;
        const t = x.trim();
        return builtinCat.has(t.toLowerCase()) ? t.toLowerCase() : t;
      })
      .filter((x): x is CalendarOpeningCategory => typeof x === "string" && isAllowedCategory(x))
      .slice(0, 32);
    if (po.length) {
      priorityOrder = Array.from(new Set(po));
    }
  }

  let rules: CalendarOpeningRule[] | undefined;
  if (Array.isArray(o.rules)) {
    const out: CalendarOpeningRule[] = [];
    for (const r of o.rules) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      const rr = r as Record<string, unknown>;
      const kind = typeof rr.kind === "string" ? rr.kind : "";
      const value = typeof rr.value === "string" ? rr.value.trim() : "";
      const categoryRaw = typeof rr.category === "string" ? rr.category.trim() : "";
      const category = builtinCat.has(categoryRaw.toLowerCase()) ? categoryRaw.toLowerCase() : categoryRaw;
      const weightRaw = rr.weight;
      const weight =
        typeof weightRaw === "number" ? weightRaw : typeof weightRaw === "string" ? Number(weightRaw) : undefined;
      if (!allowedKind.has(kind as CalendarOpeningRuleKind)) continue;
      if (!isAllowedCategory(category)) continue;
      if (!value || value.length > 120) continue;
      const w = Number.isFinite(weight ?? NaN) ? Math.max(-50, Math.min(50, Number(weight))) : undefined;
      out.push({
        kind: kind as CalendarOpeningRuleKind,
        value,
        category: category as CalendarOpeningCategory,
        ...(w !== undefined ? { weight: w } : {}),
      });
      if (out.length >= 120) break;
    }
    if (out.length) rules = out;
  }

  let calendarCategoryById: Record<string, CalendarOpeningCategory> | undefined;
  const calCatRaw = o.calendarCategoryById;
  if (calCatRaw && typeof calCatRaw === "object" && !Array.isArray(calCatRaw)) {
    const rec: Record<string, CalendarOpeningCategory> = {};
    let n = 0;
    for (const [k, v] of Object.entries(calCatRaw as Record<string, unknown>)) {
      if (n >= 40) break;
      if (k.length > 400 || typeof v !== "string") continue;
      const trimmed = v.trim();
      const normalized = builtinCat.has(trimmed.toLowerCase()) ? trimmed.toLowerCase() : trimmed;
      if (!isAllowedCategory(normalized)) continue;
      rec[k] = normalized as CalendarOpeningCategory;
      n++;
    }
    if (Object.keys(rec).length) calendarCategoryById = rec;
  }

  let calendarDisplayLabelById: Record<string, string> | undefined;
  const calDispRaw = o.calendarDisplayLabelById;
  if (calDispRaw && typeof calDispRaw === "object" && !Array.isArray(calDispRaw)) {
    const rec: Record<string, string> = {};
    let n = 0;
    for (const [k, v] of Object.entries(calDispRaw as Record<string, unknown>)) {
      if (n >= 40) break;
      if (k.length > 400 || typeof v !== "string") continue;
      const lab = v.normalize("NFKC").trim().slice(0, 80);
      if (!lab) continue;
      rec[k] = lab;
      n++;
    }
    if (Object.keys(rec).length) calendarDisplayLabelById = rec;
  }

  let gridDisplay: CalendarGridDisplaySettings | undefined;
  const gdRaw = o.gridDisplay;
  if (gdRaw && typeof gdRaw === "object" && !Array.isArray(gdRaw)) {
    const g = gdRaw as Record<string, unknown>;
    const sub: CalendarGridDisplaySettings = {};
    if (
      typeof g.weekStartsOn === "number" &&
      Number.isInteger(g.weekStartsOn) &&
      g.weekStartsOn >= 0 &&
      g.weekStartsOn <= 6
    ) {
      sub.weekStartsOn = g.weekStartsOn as CalendarWeekStartDay;
    }
    if (typeof g.maxEventsPerCell === "number" && Number.isInteger(g.maxEventsPerCell)) {
      const n = g.maxEventsPerCell;
      if (n >= 1 && n <= 5) sub.maxEventsPerCell = n;
    }
    if (g.calendarHexById && typeof g.calendarHexById === "object" && !Array.isArray(g.calendarHexById)) {
      const hexRec: Record<string, string> = {};
      let c = 0;
      for (const [k, v] of Object.entries(g.calendarHexById as Record<string, unknown>)) {
        if (c >= 40) break;
        if (k.length > 400 || typeof v !== "string") continue;
        const hex = v.trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) continue;
        hexRec[k] = hex.toLowerCase();
        c++;
      }
      if (Object.keys(hexRec).length) sub.calendarHexById = hexRec;
    }
    if (Object.keys(sub).length) gridDisplay = sub;
  }

  // categoryMultiplierById: { "school": 1.4, "usercat:xxx": 1.2, ... }
  let categoryMultiplierById: Partial<Record<CalendarOpeningCategory, number>> | undefined;
  const multRaw = o.categoryMultiplierById;
  if (multRaw && typeof multRaw === "object" && !Array.isArray(multRaw)) {
    const rec: Partial<Record<CalendarOpeningCategory, number>> = {};
    let n = 0;
    for (const [k, v] of Object.entries(multRaw as Record<string, unknown>)) {
      if (n >= 40) break;
      if (typeof k !== "string" || k.length > 80) continue;
      const key = builtinCat.has(k.toLowerCase()) ? k.toLowerCase() : k;
      if (!isAllowedCategory(key)) continue;
      const num = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (!Number.isFinite(num)) continue;
      const clamped = Math.max(0.2, Math.min(3, num));
      if (Math.abs(clamped - 1) < 1e-9) continue;
      rec[key as CalendarOpeningCategory] = clamped;
      n++;
    }
    if (Object.keys(rec).length) categoryMultiplierById = rec;
  }

  const out: CalendarOpeningSettings = {};
  if (priorityOrder?.length) out.priorityOrder = priorityOrder;
  if (rules?.length) out.rules = rules;
  if (customCategoryLabels?.length) out.customCategoryLabels = customCategoryLabels;
  if (categoryMultiplierById && Object.keys(categoryMultiplierById).length) out.categoryMultiplierById = categoryMultiplierById;
  if (calendarCategoryById && Object.keys(calendarCategoryById).length) out.calendarCategoryById = calendarCategoryById;
  if (calendarDisplayLabelById && Object.keys(calendarDisplayLabelById).length)
    out.calendarDisplayLabelById = calendarDisplayLabelById;
  if (gridDisplay && Object.keys(gridDisplay).length) out.gridDisplay = gridDisplay;
  return Object.keys(out).length ? out : undefined;
}

function parseProfile(raw: unknown): UserProfileSettings | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? o[k] : undefined);
  const out: UserProfileSettings = {};
  const nickname = str("nickname");
  const birthDate = str("birthDate");
  const zodiac = str("zodiac");
  const bloodType = str("bloodType");
  const gender = str("gender");
  const occupationRole = str("occupationRole");
  const occupationNote = str("occupationNote");
  const studentLifeNotes = str("studentLifeNotes");
  const education = str("education");
  const mbti = str("mbti");
  const loveMbti = str("loveMbti");
  const hobbies = str("hobbies");
  const interests = str("interests");
  const preferences = str("preferences");
  const onboardingCompletedAt = str("onboardingCompletedAt");
  const interestPicks = parseInterestPicks(o.interestPicks);
  const aiAddressStyle = str("aiAddressStyle");
  const aiChatTone = str("aiChatTone");
  const aiDepthLevel = str("aiDepthLevel");
  const aiEnergyPeak = str("aiEnergyPeak");
  const aiHealthComfort = str("aiHealthComfort");
  const aiHousehold = str("aiHousehold");
  const aiMemoryRecallStyle = str("aiMemoryRecallStyle");
  const aiMemoryNamePolicy = str("aiMemoryNamePolicy");
  const aiMemoryForgetBias = str("aiMemoryForgetBias");
  const aiBusyWindows = parseProfileStringArray(o.aiBusyWindows);
  const aiAvoidTopics = parseProfileStringArray(o.aiAvoidTopics);
  const aiCurrentFocus = parseProfileStringArray(o.aiCurrentFocus);
  const studentTimetableRaw = str("studentTimetable");
  const studentTimetable =
    studentTimetableRaw && studentTimetableRaw.length <= MAX_TIMETABLE_STORED
      ? studentTimetableRaw
      : undefined;
  const workLifeAnswers = parseWorkLifeAnswers(o.workLifeAnswers);
  const calendarOpening = parseCalendarOpening(o.calendarOpening);
  const aiCorrections = parseProfileStringArray(o.aiCorrections, 200, 60);

  if (nickname) out.nickname = nickname;
  if (birthDate) out.birthDate = birthDate;
  if (zodiac) out.zodiac = zodiac;
  if (bloodType) out.bloodType = bloodType;
  if (gender) out.gender = gender;
  if (occupationRole) out.occupationRole = occupationRole;
  if (occupationNote) out.occupationNote = occupationNote;
  if (studentLifeNotes) out.studentLifeNotes = studentLifeNotes;
  if (education) out.education = education;
  if (mbti) out.mbti = mbti;
  if (loveMbti) out.loveMbti = loveMbti;
  if (hobbies) out.hobbies = hobbies;
  if (interests) out.interests = interests;
  if (preferences) out.preferences = preferences;
  if (onboardingCompletedAt) out.onboardingCompletedAt = onboardingCompletedAt;
  if (interestPicks) out.interestPicks = interestPicks;
  if (aiAddressStyle) out.aiAddressStyle = aiAddressStyle;
  if (aiChatTone) out.aiChatTone = aiChatTone;
  if (aiDepthLevel) out.aiDepthLevel = aiDepthLevel;
  if (aiEnergyPeak) out.aiEnergyPeak = aiEnergyPeak;
  if (aiHealthComfort) out.aiHealthComfort = aiHealthComfort;
  if (aiHousehold) out.aiHousehold = aiHousehold;
  if (aiMemoryRecallStyle) out.aiMemoryRecallStyle = aiMemoryRecallStyle;
  if (aiMemoryNamePolicy) out.aiMemoryNamePolicy = aiMemoryNamePolicy;
  if (aiMemoryForgetBias) out.aiMemoryForgetBias = aiMemoryForgetBias;
  if (aiBusyWindows) out.aiBusyWindows = aiBusyWindows;
  if (aiAvoidTopics) out.aiAvoidTopics = aiAvoidTopics;
  if (aiCurrentFocus) out.aiCurrentFocus = aiCurrentFocus;
  if (studentTimetable) out.studentTimetable = studentTimetable;
  if (workLifeAnswers) out.workLifeAnswers = workLifeAnswers;
  if (calendarOpening) out.calendarOpening = calendarOpening;
  if (aiCorrections) out.aiCorrections = aiCorrections;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseUserSettings(settings: Prisma.JsonValue): AppUserSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const o = settings as Record<string, unknown>;
  const defaultWeatherLocation = parseDefaultWeatherLocation(o.defaultWeatherLocation);
  const profile = parseProfile(o.profile);
  const out: AppUserSettings = {};
  if (defaultWeatherLocation) out.defaultWeatherLocation = defaultWeatherLocation;
  if (profile) out.profile = profile;
  return out;
}

export type SettingsPatch = {
  defaultWeatherLocation?: DefaultWeatherLocation | null;
  profile?: Partial<UserProfileSettings> | null;
};

/** Prisma `settings` 更新用にマージ（既存キーは維持） */
export function mergeUserSettingsJson(
  current: Prisma.JsonValue,
  patch: SettingsPatch,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if ("defaultWeatherLocation" in patch) {
    if (patch.defaultWeatherLocation == null) {
      delete base.defaultWeatherLocation;
    } else {
      base.defaultWeatherLocation = patch.defaultWeatherLocation;
    }
  }
  if ("profile" in patch) {
    if (patch.profile == null) {
      delete base.profile;
    } else {
      const prev =
        base.profile && typeof base.profile === "object" && !Array.isArray(base.profile)
          ? (base.profile as Record<string, unknown>)
          : {};
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch.profile)) {
        if (v === undefined) continue;
        if (v === null || v === "") {
          delete next[k];
          continue;
        }
        if (Array.isArray(v)) {
          if (v.length === 0) {
            delete next[k];
          } else {
            next[k] = v;
          }
          continue;
        }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const keys = Object.keys(v as object);
          if (keys.length === 0) {
            delete next[k];
            continue;
          }
          next[k] = v;
          continue;
        }
        next[k] = v;
      }
      base.profile = next;
    }
  }
  return base as Prisma.InputJsonValue;
}

/** フォーム状態から API 用 profile を組み立て（onboardingWorkLifeAnswers は workLifeAnswers / studentTimetable に正規化） */
export function serializeProfileForApi(
  form: UserProfileSettings & { onboardingWorkLifeAnswers?: Record<string, string> },
): UserProfileSettings {
  const t = (s: string | undefined) => s?.trim() ?? "";
  const arr = (a: string[] | undefined) =>
    Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.length > 0) : [];
  const birthRaw = t(form.birthDate);
  const birthDate = birthRaw ? sanitizeHtmlDateYmd(birthRaw) : "";

  const ans = form.onboardingWorkLifeAnswers;
  const ttFromAnswers = ans?.st_timetable_note?.trim();
  const ttFromField = form.studentTimetable?.trim();
  const studentTimetableRaw = ttFromAnswers || ttFromField;
  const studentTimetable =
    studentTimetableRaw && studentTimetableRaw.length <= MAX_TIMETABLE_STORED
      ? studentTimetableRaw
      : undefined;

  let workLifeAnswers: Record<string, string> | undefined;
  if (ans) {
    const w: Record<string, string> = {};
    for (const [k, v] of Object.entries(ans)) {
      if (k === "st_timetable_note") continue;
      if (typeof v === "string" && v.length > 0 && v.length <= 12_000) {
        w[k] = v;
      }
    }
    if (Object.keys(w).length > 0) {
      workLifeAnswers = w;
    }
  }

  return {
    nickname: t(form.nickname),
    birthDate,
    zodiac: t(form.zodiac),
    bloodType: t(form.bloodType),
    gender: t(form.gender),
    occupationRole: t(form.occupationRole),
    occupationNote: t(form.occupationNote),
    studentLifeNotes: t(form.studentLifeNotes),
    education: t(form.education),
    mbti: t(form.mbti),
    loveMbti: t(form.loveMbti),
    hobbies: t(form.hobbies),
    interests: t(form.interests),
    preferences: t(form.preferences),
    interestPicks: form.interestPicks?.length ? form.interestPicks : [],
    onboardingCompletedAt: t(form.onboardingCompletedAt),
    aiAddressStyle: t(form.aiAddressStyle),
    aiChatTone: t(form.aiChatTone),
    aiDepthLevel: t(form.aiDepthLevel),
    aiEnergyPeak: t(form.aiEnergyPeak),
    aiBusyWindows: arr(form.aiBusyWindows),
    aiAvoidTopics: arr(form.aiAvoidTopics),
    aiCurrentFocus: arr(form.aiCurrentFocus),
    aiHealthComfort: t(form.aiHealthComfort),
    aiHousehold: t(form.aiHousehold),
    aiMemoryRecallStyle: t(form.aiMemoryRecallStyle),
    aiMemoryNamePolicy: t(form.aiMemoryNamePolicy),
    aiMemoryForgetBias: t(form.aiMemoryForgetBias),
    ...(studentTimetable ? { studentTimetable } : {}),
    ...(workLifeAnswers ? { workLifeAnswers } : {}),
  };
}

/**
 * 設定画面・オンボーディングで、DB の `workLifeAnswers` / `studentTimetable` を
 * フォーム用 `onboardingWorkLifeAnswers` に復元する。
 */
export function hydrateProfilePayloadForForms(
  p: UserProfileSettings & { onboardingWorkLifeAnswers?: Record<string, string> },
): UserProfileSettings & { onboardingWorkLifeAnswers?: Record<string, string> } {
  const extra: Record<string, string> = { ...(p.workLifeAnswers ?? {}) };
  const st = p.studentTimetable?.trim();
  if (st) {
    extra.st_timetable_note = st;
  }
  if (Object.keys(extra).length === 0) {
    return p;
  }
  return {
    ...p,
    onboardingWorkLifeAnswers: {
      ...(p.onboardingWorkLifeAnswers ?? {}),
      ...extra,
    },
  };
}

/** チャット文脈用: 空でない項目だけをテキスト化 */
export function formatUserProfileForPrompt(profile: UserProfileSettings | undefined): string {
  if (!profile) return "（未登録）";
  const lines: string[] = [];
  if (profile.nickname) lines.push(`- ニックネーム: ${profile.nickname}`);
  if (profile.birthDate) {
    const age = ageYearsFromYmd(profile.birthDate);
    lines.push(
      `- 生年月日: ${profile.birthDate}${age != null ? `（満${age}歳）` : ""}`,
    );
  }
  if (profile.zodiac) lines.push(`- 星座: ${profile.zodiac}`);
  if (profile.bloodType) lines.push(`- 血液型: ${profile.bloodType}`);
  if (profile.gender) {
    const gl: Record<string, string> = {
      female: "女性",
      male: "男性",
      nonbinary: "ノンバイナリー",
      no_answer: "答えたくない",
      other: "その他",
    };
    lines.push(`- 性別: ${gl[profile.gender] ?? profile.gender}`);
  }
  if (profile.occupationRole) {
    lines.push(`- 職業・立場: ${labelForOccupationRole(profile.occupationRole)}`);
  }
  if (profile.occupationNote) lines.push(`- 職種・補足: ${profile.occupationNote}`);
  if (profile.studentLifeNotes) lines.push(`- 学校・通学・居住など: ${profile.studentLifeNotes}`);
  const ttBlock = profile.studentTimetable?.trim()
    ? formatTimetableForPrompt(profile.studentTimetable, 2400)
    : "";
  if (ttBlock) {
    lines.push(`- 時間割（構造化・曜日ごとの科目と各限の時刻）:\n${ttBlock}`);
  }
  if (profile.education) lines.push(`- 出身地・学歴・職歴・アルバイトなど: ${profile.education}`);
  if (profile.mbti) {
    const m = profile.mbti;
    lines.push(`- MBTI: ${isMbtiType(m) ? mbtiDisplayJa(m) : m}`);
  }
  if (profile.loveMbti) {
    const l = profile.loveMbti;
    if (isLoveMbtiType(l)) {
      lines.push(`- 恋愛MBTI: ${loveMbtiDisplayJa(l)}`);
      lines.push(...loveMbtiUserPromptSubLines(l));
    } else {
      lines.push(`- 恋愛MBTI: ${l}`);
    }
  }
  const pickBlock = formatInterestPicksForPrompt(profile.interestPicks);
  if (pickBlock) lines.push(`- 関心タグ（選択）:\n${pickBlock}`);
  if (profile.preferences) lines.push(`- メモ: ${profile.preferences}`);
  if (profile.aiCorrections?.length) {
    lines.push(`- 訂正メモ（ユーザーの指摘。断定せず配慮）:\n${profile.aiCorrections.map((x) => `  - ${x}`).join("\n")}`);
  }
  lines.push(...formatAgentPersonaForPrompt(profile));
  return lines.length > 0 ? lines.join("\n") : "（未登録）";
}

const ORCH_STATIC_TRUNC = {
  studentLifeNotes: 520,
  education: 720,
  preferences: 420,
  interestPicks: 960,
  timetableSlice: 1000,
} as const;

function truncProfileField(s: string | undefined, max: number): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * オーケストレーター専用: ペルソナ（formatAgentPersonaForPrompt）と重複しない静的プロフィール。
 * 時間割は対象日の曜日列のみ（トークン削減・他曜の誤引用抑制）。
 */
export function formatOrchestratorStaticProfileBlock(
  profile: UserProfileSettings | undefined,
  entryDateYmd: string,
): string {
  if (!profile) return "";
  const lines: string[] = [];

  if (profile.nickname) lines.push(`- ニックネーム: ${profile.nickname}`);
  if (profile.birthDate) {
    const age = ageYearsFromYmd(profile.birthDate);
    lines.push(
      `- 生年月日: ${profile.birthDate}${age != null ? `（満${age}歳）` : ""}`,
    );
  }
  if (profile.zodiac) lines.push(`- 星座: ${profile.zodiac}`);
  if (profile.bloodType) lines.push(`- 血液型: ${profile.bloodType}`);
  if (profile.gender) {
    const gl: Record<string, string> = {
      female: "女性",
      male: "男性",
      nonbinary: "ノンバイナリー",
      no_answer: "答えたくない",
      other: "その他",
    };
    lines.push(`- 性別: ${gl[profile.gender] ?? profile.gender}`);
  }
  if (profile.occupationRole) {
    lines.push(`- 職業・立場: ${labelForOccupationRole(profile.occupationRole)}`);
  }
  const occNote = truncProfileField(profile.occupationNote, 320);
  if (occNote) lines.push(`- 職種・補足: ${occNote}`);
  const stNotes = truncProfileField(profile.studentLifeNotes, ORCH_STATIC_TRUNC.studentLifeNotes);
  if (stNotes) lines.push(`- 学校・通学・居住など: ${stNotes}`);

  if (profile.studentTimetable?.trim()) {
    const slice = formatTimetableForPromptDaySlice(
      profile.studentTimetable,
      entryDateYmd,
      ORCH_STATIC_TRUNC.timetableSlice,
    );
    if (slice.trim()) {
      lines.push(`- 対象日の時間割（登録データ・曜日列のみ抜粋）:\n${slice}`);
    }
  }

  const edu = truncProfileField(profile.education, ORCH_STATIC_TRUNC.education);
  if (edu) lines.push(`- 出身地・学歴・職歴・アルバイトなど: ${edu}`);

  const pickRaw = formatInterestPicksForPrompt(profile.interestPicks);
  const picks = truncProfileField(pickRaw, ORCH_STATIC_TRUNC.interestPicks);
  if (picks) lines.push(`- 関心タグ（選択）:\n${picks}`);

  const pref = truncProfileField(profile.preferences, ORCH_STATIC_TRUNC.preferences);
  if (pref) lines.push(`- メモ: ${pref}`);

  if (lines.length === 0) return "";
  return ["## ユーザー基本プロフィール（設定の抜粋。AIの話し方・避けたい話題等は「ペルソナ指示」）", "", ...lines].join("\n");
}

