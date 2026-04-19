"use client";

import { weatherCardToneClass, weatherEmojiForCode } from "@/lib/weather-visual";

type Slot = {
  time?: string;
  weatherLabel?: string;
  temperatureC?: number | null;
  weatherCode?: number | null;
};

/** `2026-04-19T09:00` などを狭いカード向けに短くする（対象日は別表示のとき時刻だけでも可読） */
function formatCompactSlotTime(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) {
    const month = String(Number(m[2]));
    const day = String(Number(m[3]));
    const hour = String(Number(m[4]));
    const min = m[5];
    return `${month}/${day} ${hour}:${min}`;
  }
  return t.length > 22 ? `${t.slice(0, 10)} ${t.slice(11, 16)}` : t;
}

export function WeatherAmPmDisplay({
  am,
  pm,
  date,
  dataSource,
  locationNote,
  /** 狭いサイドバー（例: 日記草案モーダル）向けに文字・余白を詰める */
  compact = false,
}: {
  am: Slot;
  pm: Slot;
  date?: string;
  dataSource?: "forecast" | "archive";
  locationNote?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-2 @container/wx space-y-2" : "mt-3 @container/wx space-y-3"}>
      <div
        className={
          compact
            ? "flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500"
            : "flex flex-wrap items-center gap-2 text-xs text-zinc-500"
        }
      >
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
      <div
        className={
          compact
            ? "grid grid-cols-1 gap-2 @md/wx:grid-cols-2"
            : "grid grid-cols-1 gap-3 @md/wx:grid-cols-2"
        }
      >
        <WeatherSlotCard label="午前" slot={am} compact={compact} />
        <WeatherSlotCard label="午後" slot={pm} compact={compact} />
      </div>
    </div>
  );
}

function WeatherSlotCard({ label, slot, compact }: { label: string; slot: Slot; compact?: boolean }) {
  const code = slot.weatherCode ?? null;
  const tone = weatherCardToneClass(code);
  const emoji = weatherEmojiForCode(code);

  return (
    <div
      className={`flex items-start rounded-2xl border shadow-sm ${compact ? "gap-2 p-2" : "gap-3 p-3"} ${tone}`}
    >
      <span
        className={`select-none leading-none ${compact ? "text-2xl" : "text-3xl"}`}
        title={slot.weatherLabel ?? ""}
        aria-hidden
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          className={
            compact
              ? "text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              : "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          }
        >
          {label}
        </p>
        <p
          className={
            compact
              ? "mt-0.5 truncate text-xs font-medium leading-snug text-zinc-900 dark:text-zinc-50"
              : "mt-0.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50"
          }
          title={slot.weatherLabel ? String(slot.weatherLabel) : undefined}
        >
          {slot.weatherLabel ?? "—"}
        </p>
        {slot.temperatureC != null && (
          <p
            className={
              compact
                ? "mt-0.5 text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100"
                : "mt-1 text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100"
            }
          >
            {Math.round(slot.temperatureC * 10) / 10}
            <span className={compact ? "text-xs font-normal text-zinc-500" : "text-sm font-normal text-zinc-500"}>
              °C
            </span>
          </p>
        )}
        {slot.time && (
          <p
            className={
              compact
                ? "mt-0.5 break-words font-mono text-[9px] leading-tight tabular-nums text-zinc-500 dark:text-zinc-500"
                : "mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-500"
            }
            title={slot.time}
          >
            {compact ? formatCompactSlotTime(slot.time) : slot.time}
          </p>
        )}
      </div>
    </div>
  );
}
