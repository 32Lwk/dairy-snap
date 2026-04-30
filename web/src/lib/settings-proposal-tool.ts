import { z } from "zod";
import type { CalendarOpeningCategory, CalendarOpeningRule, CalendarOpeningSettings } from "@/lib/user-settings";
import { CALENDAR_OPENING_BUILTIN_IDS } from "@/lib/user-settings";
import {
  MAX_DAY_BOUNDARY_END_TIME,
  hmToMinutes,
  isValidIanaTimeZone,
  resolveDayBoundaryEndTime,
} from "@/lib/time/user-day-boundary";

export const SETTINGS_APPLY_RATE_PER_24H = 5;

const MAX_PROPOSE_RULES = 24;
const MAX_PROPOSE_CALENDAR_ID_KEYS = 12;
const MAX_PROPOSE_MULTIPLIER_KEYS = 12;

const ruleKindSchema = z.enum(["keyword", "calendarId", "colorId", "location", "description"]);

function isValidCalendarOpeningCategory(s: string): boolean {
  if ((CALENDAR_OPENING_BUILTIN_IDS as readonly string[]).includes(s)) return true;
  return /^usercat:[a-z0-9_]{1,32}$/.test(s);
}

const calendarOpeningRuleSchema = z.object({
  kind: ruleKindSchema,
  value: z.string().min(1).max(120),
  category: z.string().max(48).refine(isValidCalendarOpeningCategory, "無効なカテゴリです"),
  weight: z.number().min(-50).max(120).optional(),
});

/** ツール／保留 JSON 用（calendarOpening は部分パッチ） */
export const calendarOpeningPatchSchema = z
  .object({
    rules: z.array(calendarOpeningRuleSchema).max(MAX_PROPOSE_RULES).optional(),
    calendarCategoryById: z
      .record(z.string().max(400), z.string().max(48).refine(isValidCalendarOpeningCategory, "無効なカテゴリです"))
      .optional()
      .refine((rec) => rec == null || Object.keys(rec).length <= MAX_PROPOSE_CALENDAR_ID_KEYS, {
        message: "calendarCategoryById の件数が多すぎます",
      }),
    categoryMultiplierById: z
      .record(z.string().max(80).refine(isValidCalendarOpeningCategory, "無効なカテゴリです"), z.number().min(0.2).max(3))
      .optional()
      .refine((rec) => rec == null || Object.keys(rec).length <= MAX_PROPOSE_MULTIPLIER_KEYS, {
        message: "categoryMultiplierById の件数が多すぎます",
      }),
  })
  .refine(
    (o) =>
      (o.rules?.length ?? 0) > 0 ||
      (o.calendarCategoryById && Object.keys(o.calendarCategoryById).length > 0) ||
      (o.categoryMultiplierById && Object.keys(o.categoryMultiplierById).length > 0),
    { message: "calendarOpening は rules / calendarCategoryById / categoryMultiplierById のいずれかを含めてください" },
  );

const profileAiPatchSchema = z
  .object({
    aiChatTone: z.string().max(32).optional(),
    aiDepthLevel: z.string().max(32).optional(),
    aiAvoidTopics: z.array(z.string().max(80)).max(32).optional(),
  })
  .refine((o) => o.aiChatTone != null || o.aiDepthLevel != null || o.aiAvoidTopics != null, {
    message: "profileAi はいずれかのフィールドが必要です",
  });

export const pendingSettingsChangeSchema = z.object({
  dayBoundaryEndTime: z
    .union([z.string().regex(/^\d{2}:\d{2}$/), z.null()])
    .optional(),
  timeZone: z.string().max(120).optional(),
  reasonJa: z.string().max(200).optional(),
  calendarOpening: calendarOpeningPatchSchema.optional(),
  profileAi: profileAiPatchSchema.optional(),
  openStudentTimetableEditor: z.literal(true).optional(),
});

export type PendingSettingsChange = z.infer<typeof pendingSettingsChangeSchema> & {
  proposedAt: string;
};

export type NormalizedCalendarOpeningPatch = z.infer<typeof calendarOpeningPatchSchema>;

export type SettingsProposalPatch = {
  dayBoundaryEndTime?: string | null;
  timeZone?: string;
  calendarOpening?: NormalizedCalendarOpeningPatch;
  profileAi?: z.infer<typeof profileAiPatchSchema>;
  openStudentTimetableEditor?: true;
};

/** 現在の calendarOpening に部分パッチをマージ（rules は kind+value で upsert） */
export function mergeCalendarOpeningPatch(
  base: CalendarOpeningSettings | undefined,
  patch: NormalizedCalendarOpeningPatch,
): CalendarOpeningSettings {
  const out: CalendarOpeningSettings = { ...(base ?? {}) };
  if (patch.rules?.length) {
    const existing = [...(out.rules ?? [])];
    for (const r of patch.rules) {
      const row: CalendarOpeningRule = {
        kind: r.kind,
        value: r.value,
        category: r.category as CalendarOpeningCategory,
        ...(typeof r.weight === "number" ? { weight: r.weight } : {}),
      };
      const idx = existing.findIndex((e) => e.kind === row.kind && e.value === row.value);
      if (idx >= 0) existing[idx] = row;
      else existing.push(row);
    }
    out.rules = existing.slice(0, 120);
  }
  if (patch.calendarCategoryById && Object.keys(patch.calendarCategoryById).length > 0) {
    out.calendarCategoryById = {
      ...(out.calendarCategoryById ?? {}),
      ...patch.calendarCategoryById,
    } as Record<string, CalendarOpeningCategory>;
  }
  if (patch.categoryMultiplierById && Object.keys(patch.categoryMultiplierById).length > 0) {
    const m = { ...(out.categoryMultiplierById ?? {}) } as Record<string, number>;
    const mult = patch.categoryMultiplierById as Record<string, number>;
    for (const [k, v] of Object.entries(mult)) {
      if (Math.abs(v - 1) < 1e-9) delete m[k];
      else m[k] = v;
    }
    out.categoryMultiplierById =
      Object.keys(m).length > 0 ? (m as CalendarOpeningSettings["categoryMultiplierById"]) : undefined;
  }
  return out;
}

/** セキュリティレビュー用（機密・全文は含めない） */
export function summarizeSettingsProposalForSecurity(patch: SettingsProposalPatch): string {
  const parts: string[] = [];
  if (patch.dayBoundaryEndTime !== undefined) {
    parts.push(`dayBoundary:${patch.dayBoundaryEndTime === null ? "reset" : patch.dayBoundaryEndTime}`);
  }
  if (patch.timeZone !== undefined) parts.push(`tz:${patch.timeZone}`);
  if (patch.calendarOpening) {
    const c = patch.calendarOpening;
    if (c.rules?.length) parts.push(`calRules+${c.rules.length}`);
    if (c.calendarCategoryById) parts.push(`calCatId+${Object.keys(c.calendarCategoryById).length}`);
    if (c.categoryMultiplierById) parts.push(`calMult+${Object.keys(c.categoryMultiplierById).length}`);
  }
  if (patch.profileAi) {
    const k = Object.keys(patch.profileAi);
    if (k.length) parts.push(`profileAi:${k.join(",")}`);
  }
  if (patch.openStudentTimetableEditor) parts.push("openTimetableEditor");
  return parts.join(";");
}

/** ユーザー向け短い要約（チャット UI バナー用） */
export function formatPendingSettingsChangeSummaryJa(raw: {
  dayBoundaryEndTime?: string | null;
  timeZone?: string;
  calendarOpening?: NormalizedCalendarOpeningPatch;
  profileAi?: z.infer<typeof profileAiPatchSchema>;
  openStudentTimetableEditor?: true;
  reasonJa?: string;
}): string {
  const lines: string[] = [];
  if (raw.dayBoundaryEndTime !== undefined) {
    lines.push(
      `日付の区切り: ${raw.dayBoundaryEndTime === null ? "既定（0時付近）に戻す" : `${raw.dayBoundaryEndTime} まで前日扱い`}`,
    );
  }
  if (raw.timeZone !== undefined) {
    lines.push(`タイムゾーン: ${raw.timeZone}`);
  }
  if (raw.calendarOpening) {
    const c = raw.calendarOpening;
    if (c.rules?.length) lines.push(`カレンダー分類ルール: ${c.rules.length} 件の追加/更新`);
    if (c.calendarCategoryById && Object.keys(c.calendarCategoryById).length > 0) {
      lines.push(`カレンダー既定カテゴリ: ${Object.keys(c.calendarCategoryById).length} 件`);
    }
    if (c.categoryMultiplierById && Object.keys(c.categoryMultiplierById).length > 0) {
      lines.push(`開口インパクト倍率: ${Object.keys(c.categoryMultiplierById).length} カテゴリ`);
    }
  }
  if (raw.profileAi) {
    if (raw.profileAi.aiChatTone) lines.push(`AI 会話のトーン: ${raw.profileAi.aiChatTone}`);
    if (raw.profileAi.aiDepthLevel) lines.push(`掘り下げ度: ${raw.profileAi.aiDepthLevel}`);
    if (raw.profileAi.aiAvoidTopics?.length) lines.push(`避けたい話題: ${raw.profileAi.aiAvoidTopics.length} 件`);
  }
  if (raw.openStudentTimetableEditor) {
    lines.push("時間割エディタを開いて編集する提案");
  }
  if (lines.length === 0) return "";
  const reason = (raw.reasonJa ?? "").trim();
  return [lines.join(" / "), reason ? `（理由: ${reason.slice(0, 120)}${reason.length > 120 ? "…" : ""}）` : ""]
    .filter(Boolean)
    .join("\n");
}

/** Validates tool args; returns normalized patch or errors. */
export function normalizeProposeSettingsArgs(raw: unknown): {
  ok: true;
  patch: SettingsProposalPatch;
  reasonJa: string;
} | {
  ok: false;
  errorJa: string;
} {
  const parsed = pendingSettingsChangeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errorJa: "提案の形式が不正です。" };
  }
  const { dayBoundaryEndTime, timeZone, reasonJa, calendarOpening, profileAi, openStudentTimetableEditor } =
    parsed.data;

  const hasBoundary = dayBoundaryEndTime !== undefined;
  const hasTz = timeZone !== undefined;
  const hasCal = calendarOpening !== undefined;
  const hasProfileAi = profileAi !== undefined;
  const hasTimetable = openStudentTimetableEditor === true;

  if (!hasBoundary && !hasTz && !hasCal && !hasProfileAi && !hasTimetable) {
    return { ok: false, errorJa: "変更内容を1つ以上指定してください（区切り・TZ・カレンダー開口・AI 嗜好・時間割エディタなど）。" };
  }

  const patch: SettingsProposalPatch = {};
  if (dayBoundaryEndTime !== undefined) {
    if (dayBoundaryEndTime === null) {
      patch.dayBoundaryEndTime = null;
    } else {
      const m = hmToMinutes(dayBoundaryEndTime);
      const maxM = hmToMinutes(MAX_DAY_BOUNDARY_END_TIME) ?? 3 * 60;
      if (m == null || m > maxM) {
        return { ok: false, errorJa: `終了時刻は 00:00〜${MAX_DAY_BOUNDARY_END_TIME} です。` };
      }
      patch.dayBoundaryEndTime = resolveDayBoundaryEndTime(dayBoundaryEndTime);
    }
  }
  if (timeZone !== undefined) {
    const t = timeZone.trim();
    if (!t || !isValidIanaTimeZone(t)) {
      return { ok: false, errorJa: "タイムゾーンは有効な IANA 名（例: Asia/Tokyo）にしてください。" };
    }
    patch.timeZone = t;
  }
  if (calendarOpening !== undefined) {
    patch.calendarOpening = calendarOpening;
  }
  if (profileAi !== undefined) {
    patch.profileAi = profileAi;
  }
  if (openStudentTimetableEditor === true) {
    patch.openStudentTimetableEditor = true;
  }

  return {
    ok: true,
    patch,
    reasonJa: (reasonJa ?? "").trim().slice(0, 200),
  };
}
