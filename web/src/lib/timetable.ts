/** 時間割表（オンボーディング用）— `st_timetable_note` に文字列で保存（v2: 複数パターン） */

export type TimetablePeriodMeta = { start?: string; durationMin?: number };

/** 列の内部ID（重複ラベル対策）と表示名（土曜列など任意） */
export type TimetableColumn = { id: string; label: string };

/** 1枚の時間割グリッド（列・時限・セル） */
export type TimetablePattern = {
  id: string;
  /** パターン名（例: A週・前期） */
  label: string;
  columns: TimetableColumn[];
  periodCount: number;
  defaultDurationMin?: number;
  periodMeta: TimetablePeriodMeta[];
  cells: Record<string, string>;
};

/** YYYY-MM-DD（`<input type="date">` と一致） */
export type TimetableValidityDate = string;

/** 保存形式 v2 */
export type TimetableBundle = {
  v: 2;
  /** 学期・年度など（全パターン共通メモ） */
  scenarioLabel?: string;
  /** この時間割が有効な期間の開始日（任意・含む） */
  validFrom?: TimetableValidityDate;
  /** この時間割が有効な期間の終了日（任意・含む） */
  validTo?: TimetableValidityDate;
  patterns: TimetablePattern[];
  activePatternIndex: number;
};

/** 後方互換 export 名 */
export type TimetableV1 = TimetablePattern;

export const TT_PREFIX = "TT_JSON_V1:";

export const STD_WEEK_LABELS = ["月", "火", "水", "木", "金"] as const;
const EXTRA_DAY_LABELS = ["土", "日"] as const;

const MAX_PERIODS = 10;
const DEFAULT_PERIOD_COUNT = 5;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseStoredValidityDate(raw: unknown): TimetableValidityDate | undefined {
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) return undefined;
  const [y, m, d] = raw.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return raw;
}

/** 表示用: 有効期間の1行（未設定なら undefined） */
export function formatTimetableValidityLabel(bundle: TimetableBundle): string | undefined {
  const from = bundle.validFrom?.trim();
  const to = bundle.validTo?.trim();
  if (!from && !to) return undefined;
  if (from && to) return `${from} 〜 ${to}`;
  if (from) return `${from} 〜`;
  return `〜 ${to}`;
}

/** 日=0 … 土=6（`Date#getUTCDay` と同じ並び） */
const TOKYO_WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const WEEKDAY_LONG_JA: Record<string, string> = {
  日: "日曜日",
  月: "月曜日",
  火: "火曜日",
  水: "水曜日",
  木: "木曜日",
  金: "金曜日",
  土: "土曜日",
};

const JA_WEEK_HEAD = new Set<string>([...TOKYO_WEEKDAY_JA]);

const EN_WEEK_KEYS: Record<string, string[]> = {
  日: ["sun", "sunday"],
  月: ["mon", "monday"],
  火: ["tue", "tues", "tuesday"],
  水: ["wed", "wednesday"],
  木: ["thu", "thur", "thurs", "thursday"],
  金: ["fri", "friday"],
  土: ["sat", "saturday"],
};

/**
 * 暦日 ymd の曜日（1文字）を Asia/Tokyo のグレゴリオ暦で求める。
 * 正午 JST 相当の UTC 瞬間に正規化し、DST のない日本で日付ずれを避ける。
 */
export function weekdayJaFromYmdTokyo(ymd: string): string | null {
  const t = ymd.trim();
  if (!ISO_DATE_RE.test(t)) return null;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const utcMs = Date.UTC(y, m - 1, d, 3, 0, 0);
  const idx = new Date(utcMs).getUTCDay();
  return TOKYO_WEEKDAY_JA[idx] ?? null;
}

/** 例: `2026-04-10（金曜日）` */
export function formatYmdWithTokyoWeekday(ymd: string): string {
  const t = ymd.trim();
  const w = weekdayJaFromYmdTokyo(t);
  if (!w) return t;
  const long = WEEKDAY_LONG_JA[w] ?? w;
  return `${t}（${long}）`;
}

function columnMatchesWeekdayLabel(colLabel: string, weekdayJa: string): boolean {
  const t = colLabel.trim().normalize("NFKC");
  if (!t) return false;
  const head = t[0];
  if (head === weekdayJa && JA_WEEK_HEAD.has(weekdayJa)) {
    if (t.length === 1) return true;
    return t.startsWith(`${weekdayJa}曜`);
  }
  const lower = t.toLowerCase();
  for (const key of EN_WEEK_KEYS[weekdayJa] ?? []) {
    if (lower === key) return true;
    if (lower.startsWith(`${key}.`)) return true;
    if (lower.startsWith(`${key} `)) return true;
  }
  return false;
}

function isYmdInTimetableValidity(ymd: string, b: TimetableBundle): boolean {
  // If the stored validity range is inverted (from > to), treat it as unset to avoid confusing behavior.
  if (b.validFrom && b.validTo && b.validFrom > b.validTo) return true;
  if (b.validFrom && ymd < b.validFrom) return false;
  if (b.validTo && ymd > b.validTo) return false;
  return true;
}

function newColumn(label: string): TimetableColumn {
  return { id: `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label };
}

function newPatternId(): string {
  return `p${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultPatternLabel(index: number): string {
  return index === 0 ? "メイン" : `時間割${index + 1}`;
}

export function emptyPattern(label = "メイン"): TimetablePattern {
  return {
    id: newPatternId(),
    label,
    columns: STD_WEEK_LABELS.map((lb) => ({ id: lb, label: lb })),
    periodCount: DEFAULT_PERIOD_COUNT,
    periodMeta: Array.from({ length: DEFAULT_PERIOD_COUNT }, () => ({})),
    cells: {},
  };
}

export function emptyTimetable(): TimetableBundle {
  const p = emptyPattern("メイン");
  return { v: 2, patterns: [p], activePatternIndex: 0 };
}

/** 表示・入力用: その限の実効コマ長（分） */
export function effectiveDurationMin(pattern: TimetablePattern, periodIndex: number): number | undefined {
  const o = pattern.periodMeta[periodIndex]?.durationMin;
  if (o != null) return o;
  return pattern.defaultDurationMin;
}

export function serializeTimetable(data: TimetableBundle): string {
  return TT_PREFIX + JSON.stringify(data);
}

type LegacyV1 = {
  v: 1;
  columns?: TimetableColumn[];
  days?: string[];
  periodCount?: number;
  defaultDurationMin?: number;
  periodMeta?: TimetablePeriodMeta[];
  cells?: Record<string, string>;
  scenarioLabel?: string;
};

function parseLegacyV1Body(o: LegacyV1): TimetablePattern {
  let columns: TimetableColumn[];
  let cells = o.cells && typeof o.cells === "object" ? { ...o.cells } : {};

  if (Array.isArray(o.columns) && o.columns.length > 0) {
    columns = o.columns
      .filter((c): c is TimetableColumn => c && typeof c.id === "string" && typeof c.label === "string")
      .map((c) => ({ id: c.id, label: c.label }));
  } else if (Array.isArray(o.days) && o.days.length > 0) {
    columns = o.days.map((label, i) => ({
      id: typeof label === "string" ? `legacy-${i}-${label}` : `legacy-${i}`,
      label: String(label),
    }));
    const labelToId = new Map<string, string>();
    for (const c of columns) {
      if (!labelToId.has(c.label)) labelToId.set(c.label, c.id);
    }
    const rewired: Record<string, string> = {};
    for (const [k, v] of Object.entries(cells)) {
      const m = /^(.+)-(\d+)$/.exec(k);
      if (m) {
        const lab = m[1];
        const p = m[2];
        const id = labelToId.get(lab);
        if (id) rewired[`${id}-${p}`] = String(v);
        else rewired[k] = String(v);
      } else {
        rewired[k] = String(v);
      }
    }
    cells = rewired;
  } else {
    columns = STD_WEEK_LABELS.map((label) => ({ id: label, label }));
  }

  let periodCount: number;
  if (typeof o.periodCount === "number" && Number.isFinite(o.periodCount)) {
    periodCount = Math.round(o.periodCount);
  } else {
    const len = Array.isArray(o.periodMeta) ? o.periodMeta.length : DEFAULT_PERIOD_COUNT;
    periodCount = len >= 1 ? Math.min(MAX_PERIODS, Math.max(DEFAULT_PERIOD_COUNT, len)) : DEFAULT_PERIOD_COUNT;
  }
  if (periodCount < 1) periodCount = DEFAULT_PERIOD_COUNT;
  periodCount = Math.min(MAX_PERIODS, periodCount);

  let periodMeta = Array.isArray(o.periodMeta) ? o.periodMeta.map((m) => ({ ...m })) : [];
  while (periodMeta.length < periodCount) periodMeta.push({});
  periodMeta = periodMeta.slice(0, periodCount);

  return {
    id: newPatternId(),
    label: "メイン",
    columns,
    periodCount,
    defaultDurationMin:
      typeof o.defaultDurationMin === "number" && o.defaultDurationMin > 0 ? o.defaultDurationMin : undefined,
    periodMeta,
    cells,
  };
}

function isPatternRaw(p: unknown): p is Record<string, unknown> {
  return (
    p != null &&
    typeof p === "object" &&
    typeof (p as Record<string, unknown>).id === "string" &&
    typeof (p as Record<string, unknown>).label === "string" &&
    Array.isArray((p as Record<string, unknown>).columns) &&
    typeof (p as Record<string, unknown>).periodCount === "number"
  );
}

export function parseTimetableStored(raw: string): TimetableBundle | null {
  const s = raw.trim();
  if (!s.startsWith(TT_PREFIX)) return null;
  try {
    const o = JSON.parse(s.slice(TT_PREFIX.length)) as Record<string, unknown>;

    if (o.v === 2 && Array.isArray(o.patterns) && o.patterns.length > 0) {
      const patterns: TimetablePattern[] = o.patterns.filter(isPatternRaw).map((p) => {
        const cols = (p.columns as unknown[]).filter(
          (c): c is TimetableColumn =>
            c != null &&
            typeof c === "object" &&
            typeof (c as TimetableColumn).id === "string" &&
            typeof (c as TimetableColumn).label === "string",
        );
        const periodCount = Math.min(MAX_PERIODS, Math.max(1, Math.round(Number(p.periodCount))));
        const defaultDurationMin =
          typeof p.defaultDurationMin === "number" && p.defaultDurationMin > 0 ? p.defaultDurationMin : undefined;
        const periodMeta = Array.isArray(p.periodMeta)
          ? (p.periodMeta as TimetablePeriodMeta[]).map((m) => ({ ...m }))
          : [];
        const cells = p.cells && typeof p.cells === "object" ? { ...(p.cells as Record<string, string>) } : {};
        return {
          id: p.id as string,
          label: p.label as string,
          columns: cols,
          periodCount,
          defaultDurationMin,
          periodMeta,
          cells,
        };
      });

      if (patterns.length === 0) return null;

      for (const pat of patterns) {
        while (pat.periodMeta.length < pat.periodCount) pat.periodMeta.push({});
        pat.periodMeta = pat.periodMeta.slice(0, pat.periodCount);
      }

      let activePatternIndex =
        typeof o.activePatternIndex === "number" && Number.isFinite(o.activePatternIndex)
          ? Math.round(o.activePatternIndex)
          : 0;
      if (activePatternIndex < 0 || activePatternIndex >= patterns.length) activePatternIndex = 0;

      return {
        v: 2,
        scenarioLabel: typeof o.scenarioLabel === "string" ? o.scenarioLabel : undefined,
        validFrom: parseStoredValidityDate(o.validFrom),
        validTo: parseStoredValidityDate(o.validTo),
        patterns,
        activePatternIndex,
      };
    }

    if (o.v !== 1) return null;

    const pattern = parseLegacyV1Body(o as unknown as LegacyV1);
    return {
      v: 2,
      scenarioLabel: typeof o.scenarioLabel === "string" ? o.scenarioLabel : undefined,
      validFrom: parseStoredValidityDate(o.validFrom),
      validTo: parseStoredValidityDate(o.validTo),
      patterns: [pattern],
      activePatternIndex: 0,
    };
  } catch {
    return null;
  }
}

/** まだ列にない標準曜（月〜金）を埋め、既存の月〜金は 月→金 の順に並べ替え */
export function appendMissingStdWeekdays(columns: TimetableColumn[]): TimetableColumn[] {
  const placed = new Set<string>();
  const result: TimetableColumn[] = [];

  for (const label of STD_WEEK_LABELS) {
    const found = columns.find((c) => c.label === label && !placed.has(c.id));
    if (found) {
      placed.add(found.id);
      result.push(found);
    } else {
      result.push(newColumn(label));
    }
  }

  for (const c of columns) {
    if (!placed.has(c.id)) {
      placed.add(c.id);
      result.push(c);
    }
  }
  return result;
}

/** 土→日の順で、まだ無ければ1列追加 */
export function appendNextWeekendColumn(columns: TimetableColumn[]): TimetableColumn[] | null {
  for (const label of EXTRA_DAY_LABELS) {
    if (!columns.some((c) => c.label === label)) {
      return [...columns, newColumn(label)];
    }
  }
  return null;
}

export function addCustomColumn(columns: TimetableColumn[], label: string): TimetableColumn[] {
  const t = label.trim();
  if (!t) return columns;
  return [...columns, newColumn(t)];
}

/** 構造だけ複製（新しい列ID・空セル）。授業内容は引き継がない */
export function duplicatePatternStructure(label: string, template: TimetablePattern): TimetablePattern {
  const t = label.trim() || defaultPatternLabel(1);
  return {
    id: newPatternId(),
    label: t,
    columns: template.columns.map((c) => newColumn(c.label)),
    periodCount: template.periodCount,
    defaultDurationMin: template.defaultDurationMin,
    periodMeta: template.periodMeta.map((m) => ({ ...m })),
    cells: {},
  };
}

/** 学生メモ用の1行要約（空コマは省略） */
export function formatTimetableSummary(raw: string): string {
  const b = parseTimetableStored(raw);
  if (!b) return "";
  const parts: string[] = [];
  const validity = formatTimetableValidityLabel(b);
  if (b.scenarioLabel?.trim()) {
    parts.push(validity ? `時間割(${b.scenarioLabel.trim()}・${validity})` : `時間割(${b.scenarioLabel.trim()})`);
  } else if (validity) {
    parts.push(`時間割(${validity})`);
  }

  for (const pat of b.patterns) {
    const tag = pat.label.trim() || "パターン";
    for (const col of pat.columns) {
      for (let p = 1; p <= pat.periodCount; p++) {
        const v = (pat.cells[`${col.id}-${p}`] ?? "").trim();
        if (v) parts.push(`${b.patterns.length > 1 ? `${tag}·` : ""}${col.label}${p}:${v}`);
      }
    }
  }
  if (parts.length === 0) return "";
  return `時間割: ${parts.join("、")}`;
}

/**
 * モデル投入用: 曜日（列）・限・開始時刻・コマ長・科目を圧縮。
 * `formatTimetableSummary` より情報が多く、`studentLifeNotes` への重複貼り付けは避ける想定。
 */
export function formatTimetableForPrompt(raw: string | undefined, maxChars = 2400): string {
  if (!raw?.trim()) return "";
  const b = parseTimetableStored(raw);
  if (!b) return raw.trim().slice(0, maxChars);

  const chunks: string[] = [];
  const validity = formatTimetableValidityLabel(b);
  const scenario = b.scenarioLabel?.trim();
  if (scenario) {
    chunks.push(validity ? `学期・メモ: ${scenario} / 有効期間: ${validity}` : `学期・メモ: ${scenario}`);
  } else if (validity) {
    chunks.push(`有効期間: ${validity}`);
  }

  for (const pat of b.patterns) {
    const head = pat.label.trim() || "パターン";
    const parts: string[] = [];

    const sched: string[] = [];
    for (let p = 0; p < pat.periodCount; p++) {
      const st = pat.periodMeta[p]?.start?.trim();
      const dur = effectiveDurationMin(pat, p);
      const bits: string[] = [`${p + 1}限`];
      if (st) bits.push(st);
      if (dur != null) bits.push(`${dur}分`);
      if (st || dur != null) sched.push(bits.join(" "));
    }
    if (sched.length) {
      parts.push(`各限の目安: ${sched.join(" / ")}`);
    }

    const dayBits: string[] = [];
    for (const col of pat.columns) {
      const cells: string[] = [];
      for (let p = 1; p <= pat.periodCount; p++) {
        const v = (pat.cells[`${col.id}-${p}`] ?? "").trim();
        if (v) cells.push(`${p}:${v}`);
      }
      if (cells.length) {
        dayBits.push(`${col.label} ${cells.join(", ")}`);
      }
    }
    if (dayBits.length) {
      parts.push(dayBits.join(" | "));
    }

    if (parts.length) {
      chunks.push(`[${head}]\n${parts.join("\n")}`);
    }
  }

  let out = chunks.join("\n\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}…`;
  }
  return out;
}

/**
 * 振り返りチャット用: 対象日の曜日列だけを渡しトークンを抑え、他曜の科目を誤って引用しにくくする。
 * パースできない場合は空文字（呼び出し側でフル `formatTimetableForPrompt` にフォールバック可）。
 */
export function formatTimetableForPromptDaySlice(
  raw: string | undefined,
  entryDateYmd: string,
  maxChars = 1200,
): string {
  if (!raw?.trim()) return "";
  const b = parseTimetableStored(raw);
  if (!b) return "";

  const ymd = entryDateYmd.trim();
  if (!ISO_DATE_RE.test(ymd)) return "";

  const weekdayJa = weekdayJaFromYmdTokyo(ymd);
  if (!weekdayJa) return "";

  const chunks: string[] = [];
  const validity = formatTimetableValidityLabel(b);
  const scenario = b.scenarioLabel?.trim();
  const long = WEEKDAY_LONG_JA[weekdayJa] ?? weekdayJa;

  chunks.push(`抜粋条件: ${ymd}（${long}）の列のみ（他曜は省略）`);
  if (scenario) {
    chunks.push(validity ? `学期・メモ: ${scenario} / 有効期間: ${validity}` : `学期・メモ: ${scenario}`);
  } else if (validity) {
    chunks.push(`有効期間: ${validity}`);
  }

  const inValidity = isYmdInTimetableValidity(ymd, b);
  if (!inValidity) {
    chunks.push(
      "※この日付は登録された時間割の有効期間外です。以下の科目は**参考**（古い可能性あり）。断定せず「今日は講義ある日？」「何限から？」など自然に確認してください。",
    );
  }

  const anchor = b.patterns[b.activePatternIndex] ?? b.patterns[0];
  const sched: string[] = [];
  for (let p = 0; p < anchor.periodCount; p++) {
    const st = anchor.periodMeta[p]?.start?.trim();
    const dur = effectiveDurationMin(anchor, p);
    const bits: string[] = [`${p + 1}限`];
    if (st) bits.push(st);
    if (dur != null) bits.push(`${dur}分`);
    if (st || dur != null) sched.push(bits.join(" "));
  }
  if (sched.length) {
    const anchorLabel = anchor.label.trim() || "メイン";
    chunks.push(`各限の目安（参考・選択中パターン「${anchorLabel}」基準）: ${sched.join(" / ")}`);
  }

  for (const pat of b.patterns) {
    const head = pat.label.trim() || "パターン";
    const col = pat.columns.find((c) => columnMatchesWeekdayLabel(c.label, weekdayJa));
    if (!col) {
      chunks.push(
        `[${head}] ※「${weekdayJa}曜」に相当する列がありません（登録列: ${pat.columns.map((c) => c.label).join("・") || "なし"}）`,
      );
      continue;
    }
    const cells: string[] = [];
    for (let p = 1; p <= pat.periodCount; p++) {
      const v = (pat.cells[`${col.id}-${p}`] ?? "").trim();
      if (v) cells.push(`${p}:${v}`);
    }
    chunks.push(`[${head}] ${col.label}: ${cells.length ? cells.join(", ") : "（科目未入力）"}`);
  }

  let out = chunks.join("\n\n");
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}…`;
  return out;
}

export function useHighSchoolSubjectPalette(stLevel: string): boolean {
  const lv = stLevel.trim();
  return lv === "jh" || lv === "hs";
}

function defaultPeriodStartHmByStudentLevel(stLevelRaw: string, period: number): string | null {
  const st = (stLevelRaw ?? "").trim();
  const p = period;
  if (!Number.isInteger(p) || p < 1 || p > 10) return null;

  // Middle/High school in Japan (typical): 08:45, 10:30, 13:00, 14:45, 16:30...
  const jhhs = ["08:45", "10:30", "13:00", "14:45", "16:30", "18:10", "19:50", "21:30", "23:10", "00:50"];
  // University (typical): 09:00, 10:40, 13:00, 14:40, 16:20...
  const univ = ["09:00", "10:40", "13:00", "14:40", "16:20", "18:00", "19:40", "21:20", "23:00", "00:40"];
  // Technical college / vocational often starts a bit earlier and has longer blocks.
  const tech = ["08:30", "10:15", "13:10", "14:55", "16:40", "18:25", "20:10", "21:55", "23:40", "01:25"];

  const arr = st === "univ" ? univ : st === "tech" || st === "jun_col" ? tech : jhhs;
  return arr[p - 1] ?? null;
}

function normalizeHmToHhMm(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function periodStartMsTokyo(entryDateYmd: string, hmRaw: string | undefined, fallbackHm?: string | null): number | null {
  const norm = hmRaw?.trim() ? normalizeHmToHhMm(hmRaw) : fallbackHm?.trim() ? normalizeHmToHhMm(fallbackHm) : null;
  if (!norm) return null;
  const ms = new Date(`${entryDateYmd}T${norm}:00+09:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 開口用: 対象日・壁時計より「この後」の講義コマを列挙（カレンダー外の固定予定として明示）。
 */
export function formatTimetableNextFocusForOpeningJa(
  raw: string | undefined,
  entryDateYmd: string,
  wallNow: Date,
  stLevelRaw: string,
): string {
  if (!raw?.trim()) return "";
  const b = parseTimetableStored(raw);
  if (!b) return "";
  const ymd = entryDateYmd.trim();
  if (!ISO_DATE_RE.test(ymd)) return "";
  const weekdayJa = weekdayJaFromYmdTokyo(ymd);
  if (!weekdayJa) return "";
  const inValidity = isYmdInTimetableValidity(ymd, b);

  type Slot = { startMs: number; endMs: number; period: number; title: string; patternLabel: string };
  const slots: Slot[] = [];
  const wallMs = wallNow.getTime();

  for (const pat of b.patterns) {
    const col = pat.columns.find((c) => columnMatchesWeekdayLabel(c.label, weekdayJa));
    if (!col) continue;
    for (let p = 1; p <= pat.periodCount; p++) {
      const title = (pat.cells[`${col.id}-${p}`] ?? "").trim();
      if (!title) continue;
      const fallbackHm = defaultPeriodStartHmByStudentLevel(stLevelRaw, p);
      const startMs = periodStartMsTokyo(ymd, pat.periodMeta[p - 1]?.start?.trim(), fallbackHm);
      if (startMs == null) continue;
      const dur = effectiveDurationMin(pat, p - 1) ?? 90;
      const endMs = startMs + dur * 60_000;
      slots.push({
        startMs,
        endMs,
        period: p,
        title,
        patternLabel: pat.label.trim() || "パターン",
      });
    }
  }

  slots.sort((a, b) => a.startMs - b.startMs || a.period - b.period);

  const GRACE_MS = 25 * 60_000;
  const relevant = slots.filter((s) => s.endMs > wallMs - GRACE_MS);
  if (relevant.length === 0) return "";

  const lines: string[] = [
    "※ 講義は Google カレンダーに無いことが多い。**開口では直近の講義コマを、遠い時刻のカレンダー予定だけに差し置かないこと。**",
  ];
  if (!inValidity) {
    lines.push("※ 注意: この日付は時間割の有効期間外。以下は参考（古い可能性あり）。断定せず確認すること。");
  }
  const head = relevant.slice(0, 5);
  const hmFmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  for (let i = 0; i < head.length; i++) {
    const s = head[i]!;
    const hm = hmFmt.format(new Date(s.startMs));
    const tag = i === 0 ? "【直近の講義の目安】" : "・";
    lines.push(`${tag} ${s.period}限 ${hm} 「${s.title}」（${s.patternLabel}）`);
  }
  if (relevant.length > head.length) {
    lines.push(`（他 ${relevant.length - head.length} コマ省略）`);
  }
  return lines.join("\n");
}

export const HS_SUBJECT_CHIPS = ["国語", "数学", "英語", "理科", "社会"] as const;
