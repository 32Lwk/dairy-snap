import SunCalc from "suncalc";

export type LocalSolarPhase = "before_sunrise" | "daytime" | "after_sunset" | "unknown";

/**
 * Compares wall-clock `now` to sunrise/sunset on **entryDateYmd** at (lat, lon).
 * Anchor uses noon on the diary day in Asia/Tokyo so the solar calculation matches the product's Tokyo calendar dates.
 */
export function getLocalSolarPhaseForEntryDay(
  entryDateYmd: string,
  now: Date,
  lat: number,
  lon: number,
): {
  phase: LocalSolarPhase;
  sunrise: Date | null;
  sunset: Date | null;
} {
  const anchor = new Date(`${entryDateYmd}T12:00:00+09:00`);
  const times = SunCalc.getTimes(anchor, lat, lon);
  const sr = times.sunrise;
  const ss = times.sunset;
  if (!sr || !ss || Number.isNaN(sr.getTime()) || Number.isNaN(ss.getTime())) {
    return { phase: "unknown", sunrise: null, sunset: null };
  }
  const t = now.getTime();
  if (t < sr.getTime()) return { phase: "before_sunrise", sunrise: sr, sunset: ss };
  if (t < ss.getTime()) return { phase: "daytime", sunrise: sr, sunset: ss };
  return { phase: "after_sunset", sunrise: sr, sunset: ss };
}
