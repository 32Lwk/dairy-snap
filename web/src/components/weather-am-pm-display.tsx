"use client";

import { weatherCardToneClass, weatherEmojiForCode } from "@/lib/weather-visual";

type Slot = {
  time?: string;
  weatherLabel?: string;
  temperatureC?: number | null;
  weatherCode?: number | null;
};

export function WeatherAmPmDisplay({
  am,
  pm,
  date,
  dataSource,
  locationNote,
}: {
  am: Slot;
  pm: Slot;
  date?: string;
  dataSource?: "forecast" | "archive";
  locationNote?: string;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {date && <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">対象日 {date}</span>}
        {dataSource === "archive" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            過去日 · アーカイブ取得
          </span>
        )}
        {dataSource === "forecast" && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
            予報API
          </span>
        )}
        {locationNote && <span className="text-zinc-600 dark:text-zinc-400">{locationNote}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <WeatherSlotCard label="午前" slot={am} />
        <WeatherSlotCard label="午後" slot={pm} />
      </div>
    </div>
  );
}

function WeatherSlotCard({ label, slot }: { label: string; slot: Slot }) {
  const code = slot.weatherCode ?? null;
  const tone = weatherCardToneClass(code);
  const emoji = weatherEmojiForCode(code);

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-3 shadow-sm ${tone}`}
    >
      <span className="select-none text-3xl leading-none" title={slot.weatherLabel ?? ""} aria-hidden>
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {slot.weatherLabel ?? "—"}
        </p>
        {slot.temperatureC != null && (
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {Math.round(slot.temperatureC * 10) / 10}
            <span className="text-sm font-normal text-zinc-500">°C</span>
          </p>
        )}
        {slot.time && (
          <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-500">{slot.time}</p>
        )}
      </div>
    </div>
  );
}
