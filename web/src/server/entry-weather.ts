import { prisma } from "@/server/db";
import { resolveWeatherCoordinates } from "@/server/weather-resolve";
import { fetchOpenMeteoDayAmPm } from "@/server/weather";
import { DEFAULT_WEATHER_LABEL } from "@/lib/location-defaults";

/**
 * エントリの緯度経度（またはユーザー既定・東京フォールバック）で、その日の午前・午後天気を取得して保存する。
 * DB の entry は更新済みであること。
 */
export async function applyAmPmWeatherForEntry(entryId: string): Promise<void> {
  const entry = await prisma.dailyEntry.findUnique({
    where: { id: entryId },
    select: {
      userId: true,
      entryDateYmd: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!entry) return;

  const resolved = await resolveWeatherCoordinates(entry.userId, {
    latitude: entry.latitude,
    longitude: entry.longitude,
  });

  const snap = await fetchOpenMeteoDayAmPm(
    resolved.lat,
    resolved.lon,
    entry.entryDateYmd,
  );

  const locationNote =
    resolved.source === "tokyo_fallback"
      ? DEFAULT_WEATHER_LABEL
      : resolved.label;

  const weatherJson = {
    kind: "am_pm" as const,
    date: snap.dateYmd,
    am: snap.am,
    pm: snap.pm,
    fetchedAt: snap.fetchedAt,
    dataSource: snap.dataSource,
    locationSource: resolved.source,
    ...(locationNote ? { locationNote } : {}),
  };

  await prisma.dailyEntry.update({
    where: { id: entryId },
    data: {
      weatherJson,
      weatherPeriod: null,
    },
  });
}
