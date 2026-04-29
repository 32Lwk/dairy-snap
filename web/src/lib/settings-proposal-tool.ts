import { z } from "zod";
import {
  MAX_DAY_BOUNDARY_END_TIME,
  hmToMinutes,
  isValidIanaTimeZone,
  resolveDayBoundaryEndTime,
} from "@/lib/time/user-day-boundary";

export const SETTINGS_APPLY_RATE_PER_24H = 5;

export const pendingSettingsChangeSchema = z.object({
  dayBoundaryEndTime: z
    .union([z.string().regex(/^\d{2}:\d{2}$/), z.null()])
    .optional(),
  timeZone: z.string().max(120).optional(),
  reasonJa: z.string().max(200).optional(),
});

export type PendingSettingsChange = z.infer<typeof pendingSettingsChangeSchema> & {
  proposedAt: string;
};

/** Validates tool args; returns normalized patch or errors. */
export function normalizeProposeSettingsArgs(raw: unknown): {
  ok: true;
  patch: { dayBoundaryEndTime?: string | null; timeZone?: string };
  reasonJa: string;
} | {
  ok: false;
  errorJa: string;
} {
  const parsed = pendingSettingsChangeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errorJa: "提案の形式が不正です。" };
  }
  const { dayBoundaryEndTime, timeZone, reasonJa } = parsed.data;
  if (dayBoundaryEndTime === undefined && timeZone === undefined) {
    return { ok: false, errorJa: "dayBoundaryEndTime または timeZone のどちらかを指定してください。" };
  }
  const patch: { dayBoundaryEndTime?: string | null; timeZone?: string } = {};
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
  return {
    ok: true,
    patch,
    reasonJa: (reasonJa ?? "").trim().slice(0, 200),
  };
}
