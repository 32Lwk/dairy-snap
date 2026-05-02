"use client";

export function PlaceCoordsLine({
  placeLine,
  latitude,
  longitude,
  showCoordinates = true,
}: {
  placeLine: string | null;
  latitude: number;
  longitude: number;
  showCoordinates?: boolean;
}) {
  if (!placeLine || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return (
    <p className="mb-1.5 text-[11px] text-zinc-800 sm:text-xs lg:text-sm dark:text-zinc-200">
      <span className="font-medium">{placeLine}</span>
      {showCoordinates ? (
        <span className="ml-1 align-baseline text-[10px] leading-none text-zinc-500 tabular-nums dark:text-zinc-400">
          ({latitude.toFixed(5)}, {longitude.toFixed(5)})
        </span>
      ) : null}
    </p>
  );
}
