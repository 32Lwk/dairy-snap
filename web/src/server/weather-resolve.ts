import {
  DEFAULT_WEATHER_LATITUDE,
  DEFAULT_WEATHER_LONGITUDE,
  DEFAULT_WEATHER_LABEL,
} from "@/lib/location-defaults";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";

export type WeatherCoordSource = "entry" | "user_default" | "tokyo_fallback";

export async function resolveWeatherCoordinates(
  userId: string,
  entry: { latitude: number | null; longitude: number | null },
): Promise<{
  lat: number;
  lon: number;
  source: WeatherCoordSource;
  label?: string;
}> {
  if (entry.latitude != null && entry.longitude != null) {
    return { lat: entry.latitude, lon: entry.longitude, source: "entry" };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const parsed = parseUserSettings(user?.settings ?? {});
  if (parsed.defaultWeatherLocation) {
    return {
      lat: parsed.defaultWeatherLocation.latitude,
      lon: parsed.defaultWeatherLocation.longitude,
      source: "user_default",
      label: parsed.defaultWeatherLocation.label,
    };
  }
  return {
    lat: DEFAULT_WEATHER_LATITUDE,
    lon: DEFAULT_WEATHER_LONGITUDE,
    source: "tokyo_fallback",
    label: DEFAULT_WEATHER_LABEL,
  };
}
