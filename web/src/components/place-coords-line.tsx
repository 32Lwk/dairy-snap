"use client";

export function PlaceCoordsLine({
  placeLine,
  latitude,
  longitude,
}: {
  placeLine: string | null;
  latitude: number;
  longitude: number;
}) {
  if (!placeLine || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return (
    <p className="mb-1.5 text-sm text-zinc-800 dark:text-zinc-200">
      <span className="font-medium">{placeLine}</span>
      <span className="ml-1 align-baseline text-[10px] leading-none text-zinc-500 tabular-nums dark:text-zinc-400">
        ({latitude.toFixed(5)}, {longitude.toFixed(5)})
      </span>
    </p>
  );
}
