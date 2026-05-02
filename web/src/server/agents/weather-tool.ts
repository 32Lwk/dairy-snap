import { prisma } from "@/server/db";
import { fetchOpenMeteoCurrent, fetchOpenMeteoDayAmPm } from "@/server/weather";
import { resolveWeatherCoordinates } from "@/server/weather-resolve";
import { weatherLabelForCode } from "@/server/weather";
import { formatOrchestratorWallClockDaylightBlock } from "@/lib/time/entry-temporal-context";
import { getLocalSolarPhaseForEntryDay, type LocalSolarPhase } from "@/lib/time/local-solar-phase";
import {
  diffCalendarDaysInZone,
  getEffectiveTodayYmd,
  resolveDayBoundaryEndTime,
  resolveUserTimeZone,
} from "@/lib/time/user-day-boundary";
import { parseUserSettings } from "@/lib/user-settings";
import type { WeatherContext, WeatherToolRequest } from "./types";

type AmPmEntry = {
  weatherCode?: number | null;
  weatherLabel?: string;
  temperatureC?: number | null;
};

type StoredWeatherJson = {
  kind?: string;
  am?: AmPmEntry;
  pm?: AmPmEntry;
};

function subjectForHint(daysDiff: number): string {
  if (daysDiff === 0) return "今日";
  if (daysDiff === 1) return "きのう";
  return "この日";
}

function buildWeatherNarrativeHintJa(
  ctx: Pick<WeatherContext, "amLabel" | "pmLabel" | "amTempC" | "pmTempC" | "source">,
  meta: { daysDiff: number; solarPhase: LocalSolarPhase },
): string {
  if (ctx.source === "none") return "天気情報を取得できなかった。";

  const { amLabel, pmLabel, amTempC, pmTempC } = ctx;
  const { daysDiff, solarPhase } = meta;
  const sub = subjectForHint(daysDiff);
  const isToday = daysDiff === 0;

  const rainWords = ["雨", "霧雨", "雷雨"];
  const cloudyWords = ["曇り", "霧"];
  const snowWords = ["雪"];

  const isRainy = (lbl: string) => rainWords.some((w) => lbl.includes(w));
  const isCloudy = (lbl: string) => cloudyWords.some((w) => lbl.includes(w));
  const isSnowy = (lbl: string) => snowWords.some((w) => lbl.includes(w));

  const tempDiff = amTempC != null && pmTempC != null ? Math.abs(pmTempC - amTempC) : null;

  const hints: string[] = [];

  if (isRainy(amLabel) || isRainy(pmLabel)) {
    if (isToday && solarPhase === "before_sunrise") {
      hints.push(
        "予報では雨の傾向。夜明け前なら、この日の予定・講義・次の予定までの過ごし方に触れよい。眠さを主役にしない。外出を強く勧めない。",
      );
    } else if (isToday && solarPhase === "daytime") {
      hints.push("雨の予報。傘・移動・気分の話につなげてもよい。");
    } else if (isToday && solarPhase === "after_sunset") {
      hints.push("この日の予報では雨。夕方以降の振り返りや体調に触れてもよい。");
    } else if (isToday) {
      hints.push("雨の予報。体調や予定の話につなげてもよい。");
    } else {
      hints.push(`${sub}は雨の予報だった。天気が体調や行動に与えた影響を聞いてもよい。`);
    }
  } else if (isSnowy(amLabel) || isSnowy(pmLabel)) {
    if (isToday && solarPhase === "before_sunrise") {
      hints.push(
        "予報では雪の傾向。夜明け前なら寒さ・防寒に加え、予定・講義・それまでの過ごし方に触れよい。眠さを主役にしない。無理な外出は勧めない。",
      );
    } else if (isToday && solarPhase === "daytime") {
      hints.push("雪の予報。寒さ・移動・気分の話につなげてもよい。");
    } else if (isToday && solarPhase === "after_sunset") {
      hints.push("この日の予報では雪。寒さや振り返りに触れてもよい。");
    } else if (isToday) {
      hints.push("雪の予報。寒さや体調の話につなげてもよい。");
    } else {
      hints.push(`${sub}は雪の予報だった。寒さや外出の振り返りに触れてもよい。`);
    }
  } else if (isCloudy(amLabel) && isCloudy(pmLabel)) {
    if (isToday && solarPhase === "before_sunrise") {
      hints.push(
        "予報では終日曇り寄り。夜明け前なら予定・講義・次の予定までの過ごし方に触れよい。眠さを主役にしない。日中の天気は断定しない。",
      );
    } else if (isToday && solarPhase === "after_sunset") {
      hints.push("この日の予報では曇りがち。夕方以降の過ごし方や気分の振り返りに触れてもよい。");
    } else if (!isToday) {
      hints.push(`${sub}は曇りがちの予報だった。気分・体調の話につなげてもよい。`);
    } else {
      hints.push("曇りがちの予報。気分・体調の話につなげてもよい。");
    }
  } else if (amLabel.includes("晴") || pmLabel.includes("晴")) {
    if (isToday && solarPhase === "before_sunrise") {
      hints.push(
        "午前・午後の予報は晴れ寄りだが、いまは夜明け前の可能性が高い。外出や日差しより、カレンダーの予定・講義（何限から等）・次の予定までの過ごし方・必要なら軽く夢に触れよい。眠さを主役にしない。",
      );
    } else if (isToday && solarPhase === "daytime") {
      hints.push("晴れの予報。外の様子や気分の話にもつなげてよい。");
    } else if (isToday && solarPhase === "after_sunset") {
      hints.push("昼間は晴れの予報だった。夕方以降の過ごし方や振り返りに触れてもよい。");
    } else if (isToday) {
      hints.push("晴れ寄りの予報。気分や予定に触れてもよい。");
    } else {
      hints.push(`${sub}の予報は晴れ寄り。外出や気分の振り返りに触れてもよい。`);
    }
  }

  if (tempDiff != null && tempDiff >= 8) {
    hints.push(
      isToday
        ? `今日は昼と夜の気温差が大きい予報（約${Math.round(tempDiff)}℃差）。体調管理を気にかけてもよい。`
        : `${sub}は昼と夜の気温差が大きい予報だった（約${Math.round(tempDiff)}℃差）。体調の振り返りに触れてもよい。`,
    );
  }

  if (amTempC != null && amTempC <= 5) {
    if (isToday && solarPhase === "before_sunrise") {
      hints.push("早朝は冷え込みがち。防寒に一言触れる程度にし、主な問いは予定やそれまでの過ごし方に寄せてよい。");
    } else {
      hints.push(
        isToday
          ? "午前はかなり寒い予報。防寒・体調の話をしてもよい。"
          : `${sub}の午前はかなり寒い予報だった。防寒・体調の振り返りに触れてもよい。`,
      );
    }
  } else if (pmTempC != null && pmTempC >= 30) {
    hints.push(
      isToday
        ? "午後はかなり暑い予報。熱中症・疲れの話をしてもよい。"
        : `${sub}の午後はかなり暑い予報だった。熱中症・疲れの振り返りに触れてもよい。`,
    );
  }

  return hints.join(" ") || "天気情報から特別なヒントなし。";
}

type WeatherLayerBase = Omit<
  WeatherContext,
  "narrativeHint" | "wallClockDaylightBlockEn" | "entryTodaySolarPhase"
>;

function attachPromptLayers(
  base: WeatherLayerBase,
  req: WeatherToolRequest,
  lat: number,
  lon: number,
  userTz: string,
  dayBoundaryRaw: string | null | undefined,
): WeatherContext {
  const now = req.now ?? new Date();
  const boundary = resolveDayBoundaryEndTime(dayBoundaryRaw ?? null);
  const effectiveToday = getEffectiveTodayYmd(now, userTz, boundary);
  const daysDiff = diffCalendarDaysInZone(req.entryDateYmd, effectiveToday, userTz);
  const solar = daysDiff === 0 ? getLocalSolarPhaseForEntryDay(req.entryDateYmd, now, lat, lon) : null;
  const solarPhase = solar?.phase ?? "unknown";

  return {
    ...base,
    entryTodaySolarPhase: solar?.phase,
    narrativeHint: buildWeatherNarrativeHintJa(base, { daysDiff, solarPhase }),
    promptLat: lat,
    promptLon: lon,
    wallClockDaylightBlockEn: formatOrchestratorWallClockDaylightBlock({
      entryDateYmd: req.entryDateYmd,
      now,
      lat,
      lon,
      timeZone: userTz,
      dayBoundaryEndTime: dayBoundaryRaw,
      beforeSunriseLectureHook: true,
    }),
  };
}

export async function getWeatherContext(req: WeatherToolRequest): Promise<WeatherContext> {
  const [entry, userRow] = await Promise.all([
    prisma.dailyEntry.findUnique({
      where: { id: req.entryId },
      select: { weatherJson: true, latitude: true, longitude: true, userId: true },
    }),
    prisma.user.findUnique({
      where: { id: req.userId },
      select: { settings: true, timeZone: true },
    }),
  ]);

  const s = parseUserSettings(userRow?.settings ?? {});
  const userTz = resolveUserTimeZone(s.profile?.timeZone, userRow?.timeZone);
  const dayBoundaryRaw = s.dayBoundaryEndTime ?? null;

  const resolved = await resolveWeatherCoordinates(req.userId, {
    latitude: entry?.latitude ?? null,
    longitude: entry?.longitude ?? null,
  });

  if (entry?.weatherJson) {
    const wj = entry.weatherJson as StoredWeatherJson;
    if (wj.kind === "am_pm" && wj.am && wj.pm) {
      const base: WeatherLayerBase = {
        dateYmd: req.entryDateYmd,
        amLabel: wj.am.weatherLabel ?? weatherLabelForCode(wj.am.weatherCode ?? null),
        amTempC: wj.am.temperatureC ?? null,
        pmLabel: wj.pm.weatherLabel ?? weatherLabelForCode(wj.pm.weatherCode ?? null),
        pmTempC: wj.pm.temperatureC ?? null,
        source: "db_cached",
      };
      return attachPromptLayers(base, req, resolved.lat, resolved.lon, userTz, dayBoundaryRaw);
    }
  }

  try {
    const [snap, cur] = await Promise.all([
      fetchOpenMeteoDayAmPm(resolved.lat, resolved.lon, req.entryDateYmd),
      fetchOpenMeteoCurrent(resolved.lat, resolved.lon).catch(() => null),
    ]);
    const timeIso =
      cur && typeof cur.raw?.time === "string" && cur.raw.time.trim()
        ? cur.raw.time.trim()
        : cur
          ? cur.fetchedAt
          : "";
    const base: WeatherLayerBase = {
      dateYmd: req.entryDateYmd,
      amLabel: snap.am.weatherLabel,
      amTempC: snap.am.temperatureC,
      pmLabel: snap.pm.weatherLabel,
      pmTempC: snap.pm.temperatureC,
      source: "open_meteo",
      openMeteoCurrent: cur
        ? {
            weatherLabel: cur.weatherLabel,
            temperatureC: cur.temperatureC,
            timeIso,
          }
        : undefined,
    };
    return attachPromptLayers(base, req, resolved.lat, resolved.lon, userTz, dayBoundaryRaw);
  } catch {
    const now = req.now ?? new Date();
    const base: WeatherLayerBase = {
      dateYmd: req.entryDateYmd,
      amLabel: "不明",
      amTempC: null,
      pmLabel: "不明",
      pmTempC: null,
      source: "none",
    };
    return {
      ...base,
      narrativeHint: buildWeatherNarrativeHintJa(base, {
        daysDiff: diffCalendarDaysInZone(
          req.entryDateYmd,
          getEffectiveTodayYmd(now, userTz, resolveDayBoundaryEndTime(dayBoundaryRaw ?? null)),
          userTz,
        ),
        solarPhase: "unknown",
      }),
      promptLat: resolved.lat,
      promptLon: resolved.lon,
      wallClockDaylightBlockEn: formatOrchestratorWallClockDaylightBlock({
        entryDateYmd: req.entryDateYmd,
        now,
        lat: resolved.lat,
        lon: resolved.lon,
        timeZone: userTz,
        dayBoundaryEndTime: dayBoundaryRaw,
        beforeSunriseLectureHook: true,
      }),
    };
  }
}

export function formatWeatherForPrompt(ctx: WeatherContext): string {
  if (ctx.source === "none") return "（天気情報なし）";
  const am = `${ctx.amLabel}${ctx.amTempC != null ? ` ${ctx.amTempC}℃` : ""}`;
  const pm = `${ctx.pmLabel}${ctx.pmTempC != null ? ` ${ctx.pmTempC}℃` : ""}`;
  const lines = [`午前: ${am} / 午後: ${pm}`];
  if (ctx.openMeteoCurrent) {
    const c = ctx.openMeteoCurrent;
    const t = c.temperatureC != null ? ` ${c.temperatureC}℃` : "";
    lines.push(`現況（Open-Meteo・観測時刻 ${c.timeIso}）: ${c.weatherLabel}${t}`);
  }
  lines.push(`会話ヒント: ${ctx.narrativeHint ?? ""}`);
  return lines.join("\n");
}

/** `query_weather` のツール応答用: system と同じ本文に、夜明け前・極域等のメモを足す */
export function formatWeatherToolReply(weatherText: string, ctx: WeatherContext): string {
  const ph = ctx.entryTodaySolarPhase;
  if (ph === "before_sunrise") {
    return `${weatherText}\n\n（応答メモ: 夜明け前の時間帯の可能性が高い。いま外の明るさや天気を断定せず、現況・午前午後予報は参考に留める。）`;
  }
  if (ph === "unknown") {
    return `${weatherText}\n\n（応答メモ: 日の出・日の入りが計算できない地域の可能性。外の様子の断定を避け、予報・現況ラベルのみを根拠にする。）`;
  }
  return weatherText;
}
