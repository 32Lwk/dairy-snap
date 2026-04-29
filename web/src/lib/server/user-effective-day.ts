import { parseUserSettings } from "@/lib/user-settings";
import {
  getCalendarYmdInZone,
  getEffectiveTodayYmd,
  getNextEffectiveDayResetAtIso,
  resolveDayBoundaryEndTime,
  resolveUserTimeZone,
} from "@/lib/time/user-day-boundary";
import { prisma } from "@/server/db";

export type UserEffectiveDayContext = {
  effectiveYmd: string;
  calendarYmd: string;
  timeZone: string;
  dayBoundaryEndTime: string;
  resetAtIso: string;
};

export async function getUserEffectiveDayContext(
  userId: string,
  now: Date = new Date(),
): Promise<UserEffectiveDayContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true, timeZone: true },
  });
  const s = parseUserSettings(user?.settings ?? {});
  const tz = resolveUserTimeZone(s.profile?.timeZone, user?.timeZone);
  const boundary = resolveDayBoundaryEndTime(s.dayBoundaryEndTime ?? null);
  const effectiveYmd = getEffectiveTodayYmd(now, tz, boundary);
  const calendarYmd = getCalendarYmdInZone(now, tz);
  const resetAtIso = getNextEffectiveDayResetAtIso(now, tz, boundary);
  return {
    effectiveYmd,
    calendarYmd,
    timeZone: tz,
    dayBoundaryEndTime: boundary,
    resetAtIso,
  };
}
