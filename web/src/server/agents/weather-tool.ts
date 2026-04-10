import { prisma } from "@/server/db";
import { resolveWeatherCoordinates } from "@/server/weather-resolve";
import { fetchOpenMeteoDayAmPm, weatherLabelForCode } from "@/server/weather";
import type { WeatherContext } from "@/server/agents/types";

type StoredWeatherJson = {
  kind?: string;
  am?: { temperatureC?: number | null; weatherLabel?: string; time?: string };
  pm?: { temperatureC?: number | null; weatherLabel?: string; time?: string };
  locationNote?: string;
  dataSource?: string;
};

function buildSummary(ctx: Omit<WeatherContext, "summary">): string {
  if (ctx.dataSource === "unavailable") return "天気情報なし";

  const parts: string[] = [];
  const am = ctx.am;
  const pm = ctx.pm;

  if (am?.weatherLabel && am.weatherLabel !== "不明") {
    const temp = am.temperatureC != null ? `${Math.round(am.temperatureC)}℃` : "";
    parts.push(`午前: ${am.weatherLabel}${temp ? ` ${temp}` : ""}`);
  }
  if (pm?.weatherLabel && pm.weatherLabel !== "不明") {
    const temp = pm.temperatureC != null ? `${Math.round(pm.temperatureC)}℃` : "";
    parts.push(`午後: ${pm.weatherLabel}${temp ? ` ${temp}` : ""}`);
  }
  if (ctx.locationNote) parts.push(`地点: ${ctx.locationNote}`);
  if (parts.length === 0) return "天気情報なし";
  return parts.join(" / ");
}

function parseStoredWeatherJson(
  raw: unknown,
  entryDateYmd: string,
): Omit<WeatherContext, "summary"> | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as StoredWeatherJson;
  if (w.kind !== "am_pm") return null;

  return {
    dateYmd: entryDateYmd,
    am: w.am
      ? {
          temperatureC: w.am.temperatureC ?? null,
          weatherLabel: w.am.weatherLabel ?? "不明",
          time: w.am.time ?? "",
        }
      : null,
    pm: w.pm
      ? {
          temperatureC: w.pm.temperatureC ?? null,
          weatherLabel: w.pm.weatherLabel ?? "不明",
          time: w.pm.time ?? "",
        }
      : null,
    locationNote: w.locationNote,
    dataSource: "entry_cached",
  };
}

/**
 * 対象日の天気スナップショットを取得する。
 * 1. entry.weatherJson に am_pm 形式のデータがあれば即座に返す（再取得なし）
 * 2. なければ Open-Meteo から取得してフォールバック
 */
export async function getWeatherContext(
  userId: string,
  entryId: string,
  entryDateYmd: string,
): Promise<WeatherContext> {
  const entry = await prisma.dailyEntry.findUnique({
    where: { id: entryId },
    select: { weatherJson: true, latitude: true, longitude: true },
  });

  if (entry?.weatherJson) {
    const parsed = parseStoredWeatherJson(entry.weatherJson, entryDateYmd);
    if (parsed) {
      const ctx = { ...parsed, summary: "" };
      ctx.summary = buildSummary(parsed);
      return ctx;
    }
  }

  try {
    const resolved = await resolveWeatherCoordinates(userId, {
      latitude: entry?.latitude ?? null,
      longitude: entry?.longitude ?? null,
    });
    const snap = await fetchOpenMeteoDayAmPm(resolved.lat, resolved.lon, entryDateYmd);

    const base: Omit<WeatherContext, "summary"> = {
      dateYmd: entryDateYmd,
      am: {
        temperatureC: snap.am.temperatureC,
        weatherLabel: snap.am.weatherLabel,
        time: snap.am.time,
      },
      pm: {
        temperatureC: snap.pm.temperatureC,
        weatherLabel: snap.pm.weatherLabel,
        time: snap.pm.time,
      },
      locationNote: resolved.label,
      dataSource: "live_fetch",
    };
    return { ...base, summary: buildSummary(base) };
  } catch {
    return {
      dateYmd: entryDateYmd,
      am: null,
      pm: null,
      dataSource: "unavailable",
      summary: "天気情報なし",
    };
  }
}

export { weatherLabelForCode };
