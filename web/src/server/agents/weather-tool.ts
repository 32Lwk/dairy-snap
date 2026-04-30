import { prisma } from "@/server/db";
import { fetchOpenMeteoDayAmPm } from "@/server/weather";
import { resolveWeatherCoordinates } from "@/server/weather-resolve";
import { weatherLabelForCode } from "@/server/weather";
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

function buildNarrativeHint(ctx: Omit<WeatherContext, "narrativeHint">): string {
  const { amLabel, pmLabel, amTempC, pmTempC } = ctx;
  const rainWords = ["雨", "霧雨", "雷雨"];
  const cloudyWords = ["曇り", "霧"];
  const snowWords = ["雪"];

  const isRainy = (lbl: string) => rainWords.some((w) => lbl.includes(w));
  const isCloudy = (lbl: string) => cloudyWords.some((w) => lbl.includes(w));
  const isSnowy = (lbl: string) => snowWords.some((w) => lbl.includes(w));

  const tempDiff = amTempC != null && pmTempC != null ? Math.abs(pmTempC - amTempC) : null;

  const hints: string[] = [];

  if (isRainy(amLabel) || isRainy(pmLabel)) {
    hints.push("今日は雨が降っていた。天気が気分に与えた影響を聞いてみてもよい。");
  } else if (isSnowy(amLabel) || isSnowy(pmLabel)) {
    hints.push("今日は雪だった。寒さや外出について触れてもよい。");
  } else if (isCloudy(amLabel) && isCloudy(pmLabel)) {
    hints.push("今日は曇りがちだった。気分・体調の話につなげてもよい。");
  } else if (amLabel.includes("晴") || pmLabel.includes("晴")) {
    hints.push("今日は晴れていた。外出・気分良さの話につなげてもよい。");
  }

  if (tempDiff != null && tempDiff >= 8) {
    hints.push(`昼と夜の気温差が大きかった（約${Math.round(tempDiff)}℃差）。体調管理を気にかけてもよい。`);
  }

  if (amTempC != null && amTempC <= 5) {
    hints.push("今日はかなり寒かった。防寒・体調の話をしてもよい。");
  } else if (pmTempC != null && pmTempC >= 30) {
    hints.push("今日はかなり暑かった。熱中症・疲れの話をしてもよい。");
  }

  return hints.join(" ") || "天気情報から特別なヒントなし。";
}

export async function getWeatherContext(req: WeatherToolRequest): Promise<WeatherContext> {
  const entry = await prisma.dailyEntry.findUnique({
    where: { id: req.entryId },
    select: { weatherJson: true, latitude: true, longitude: true, userId: true },
  });

  if (entry?.weatherJson) {
    const wj = entry.weatherJson as StoredWeatherJson;
    if (wj.kind === "am_pm" && wj.am && wj.pm) {
      const ctx: Omit<WeatherContext, "narrativeHint"> = {
        dateYmd: req.entryDateYmd,
        amLabel: wj.am.weatherLabel ?? weatherLabelForCode(wj.am.weatherCode ?? null),
        amTempC: wj.am.temperatureC ?? null,
        pmLabel: wj.pm.weatherLabel ?? weatherLabelForCode(wj.pm.weatherCode ?? null),
        pmTempC: wj.pm.temperatureC ?? null,
        source: "db_cached",
      };
      return { ...ctx, narrativeHint: buildNarrativeHint(ctx) };
    }
  }

  try {
    const resolved = await resolveWeatherCoordinates(req.userId, {
      latitude: entry?.latitude ?? null,
      longitude: entry?.longitude ?? null,
    });
    const snap = await fetchOpenMeteoDayAmPm(resolved.lat, resolved.lon, req.entryDateYmd);
    const ctx: Omit<WeatherContext, "narrativeHint"> = {
      dateYmd: req.entryDateYmd,
      amLabel: snap.am.weatherLabel,
      amTempC: snap.am.temperatureC,
      pmLabel: snap.pm.weatherLabel,
      pmTempC: snap.pm.temperatureC,
      source: "open_meteo",
    };
    return { ...ctx, narrativeHint: buildNarrativeHint(ctx) };
  } catch {
    return {
      dateYmd: req.entryDateYmd,
      amLabel: "不明",
      amTempC: null,
      pmLabel: "不明",
      pmTempC: null,
      source: "none",
      narrativeHint: "天気情報を取得できなかった。",
    };
  }
}

export function formatWeatherForPrompt(ctx: WeatherContext): string {
  if (ctx.source === "none") return "（天気情報なし）";
  const am = `${ctx.amLabel}${ctx.amTempC != null ? ` ${ctx.amTempC}℃` : ""}`;
  const pm = `${ctx.pmLabel}${ctx.pmTempC != null ? ` ${ctx.pmTempC}℃` : ""}`;
  return `午前: ${am} / 午後: ${pm}\n会話ヒント: ${ctx.narrativeHint ?? ""}`;
}
