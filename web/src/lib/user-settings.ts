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
  "hobby",
  "other",
] as const;

export type BuiltinCalendarOpeningCategory = (typeof CALENDAR_OPENING_BUILTIN_IDS)[number];

/** 組み込み8種 + ユーザー追加（`usercat:` + スラッグ） */
export type CalendarOpeningCategory = BuiltinCalendarOpeningCategory | `usercat:${string}`;

export const CALENDAR_OPENING_BUILTIN_CATS: { id: BuiltinCalendarOpeningCategory; label: string }[] = [
  { id: "job_hunt", label: "就活/面接" },
  { id: "parttime", label: "バイト/シフト" },
  { id: "date", label: "デート/恋愛" },
  { id: "school", label: "授業/試験" },
  { id: "health", label: "通院/健康" },
  { id: "family", label: "家族/友人" },
  { id: "hobby", label: "趣味/イベント" },
  { id: "other", label: "その他" },
];

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
  /** Google カレンダー ID → 分類デフォルト（ルール・キーワードより強く効かせる） */
  calendarCategoryById?: Record<string, CalendarOpeningCategory>;
  /** カレンダー画面のグリッド表示オプション */
  gridDisplay?: CalendarGridDisplaySettings;
};

/** `calendarCategoryById` のスコア（キーワードルールより優先しやすい重み） */
export const CALENDAR_DEFAULT_CATEGORY_WEIGHT = 100;

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

/** 優先順位配列を正規化（組み込み・カスタムを統合、最大32件） */
export function normalizeCalendarOpeningPriorityOrder(
  opening: CalendarOpeningSettings | null | undefined,
): CalendarOpeningCategory[] {
  const builtins = [...CALENDAR_OPENING_BUILTIN_IDS] as CalendarOpeningCategory[];
  const customIds = (opening?.customCategoryLabels ?? []).map((l) => labelToUserCategoryId(l));
  const allow = new Set<string>([...builtins, ...customIds]);
  const po = opening?.priorityOrder ?? [];
  const filtered = po.filter((x): x is CalendarOpeningCategory => typeof x === "string" && allow.has(x));
  const uniq: CalendarOpeningCategory[] = [];
  const push = (x: CalendarOpeningCategory) => {
    if (!uniq.includes(x)) uniq.push(x);
  };
  for (const x of filtered) push(x);
  for (const x of builtins) push(x);
  for (const x of customIds) push(x);
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
      const category = typeof rr.category === "string" ? rr.category : "";
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
      if (!isAllowedCategory(v)) continue;
      rec[k] = v as CalendarOpeningCategory;
      n++;
    }
    if (Object.keys(rec).length) calendarCategoryById = rec;
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

  const out: CalendarOpeningSettings = {};
  if (priorityOrder?.length) out.priorityOrder = priorityOrder;
  if (rules?.length) out.rules = rules;
  if (customCategoryLabels?.length) out.customCategoryLabels = customCategoryLabels;
  if (calendarCategoryById && Object.keys(calendarCategoryById).length) out.calendarCategoryById = calendarCategoryById;
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
