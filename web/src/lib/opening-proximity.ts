/**
 * 開口時: カレンダー各イベントの「Impact スコア」に掛ける近接係数。
 * 未来の予定ほど開始が近いほど係数が大きくなる（同日で遅い予定は相対的に下がる）。
 */
export function openingProximityImpactMultiplier(
  wallNow: Date,
  startIso: string,
  endIso: string,
  timing: "all_day" | "upcoming" | "ongoing" | "past",
): number {
  if (timing === "all_day") return 1.18;
  if (timing === "ongoing") return 1.45;
  if (timing === "past") return 0.42;

  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return 1;

  const min = (start - wallNow.getTime()) / 60_000;

  if (min < -120) return 0.28;
  if (min <= 0) return 1.12;

  return 1 + 120 / (30 + min);
}
