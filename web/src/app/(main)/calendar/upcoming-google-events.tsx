"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useState } from "react";
import { resolveGcalEventColor } from "@/lib/gcal-event-color";
import {
  calendarOpeningCategoryOptions,
  lookupCalendarCategoriesById,
  resolveCalendarDisplayNameForUser,
  type CalendarOpeningSettings,
} from "@/lib/user-settings";

const UPCOMING_EVENTS_CACHE_PREFIX = "daily-snap.upcoming-events.v1";
/** この時間までは再訪時にネットワーク取得しない（手動「更新」は常に取得） */
const UPCOMING_EVENTS_CACHE_MAX_MS = 30 * 60 * 1000;

type Ev = {
  eventId?: string;
  title: string;
  start: string;
  end: string;
  location: string;
  calendarName?: string;
  colorId?: string;
  calendarId?: string;
  fixedCategory?: string;
};

function tokyoHm(isoLike: string): string {
  if (!isoLike || /^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return "";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(d);
}

function todayTokyoYmd(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("/", "-");
}

type UpcomingCachePayload = {
  v: 1;
  savedAt: number;
  events: Ev[];
};

function upcomingEventsCacheKey(ymd: string): string {
  return `${UPCOMING_EVENTS_CACHE_PREFIX}:${ymd}`;
}

function readUpcomingEventsCache(ymd: string): Ev[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(upcomingEventsCacheKey(ymd));
    if (!raw) return null;
    const p = JSON.parse(raw) as UpcomingCachePayload;
    if (p.v !== 1 || !Array.isArray(p.events)) return null;
    if (Date.now() - p.savedAt > UPCOMING_EVENTS_CACHE_MAX_MS) return null;
    return p.events;
  } catch {
    return null;
  }
}

function writeUpcomingEventsCache(ymd: string, events: Ev[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: UpcomingCachePayload = { v: 1, savedAt: Date.now(), events };
    sessionStorage.setItem(upcomingEventsCacheKey(ymd), JSON.stringify(payload));
  } catch {
    /* 容量・プライベートモード等 */
  }
}

export function UpcomingGoogleEvents({
  filter,
  calendarHexById,
  calendarDisplayLabelById,
  /** 分類チップの表示名（カスタムカテゴリ含む） */
  calendarOpening,
}: {
  filter?: { apply: (ev: Ev) => boolean; infer: (ev: Ev) => string };
  calendarHexById?: Record<string, string>;
  calendarDisplayLabelById?: Record<string, string>;
  calendarOpening?: CalendarOpeningSettings | null;
}) {
  const hexMap = calendarHexById ?? {};
  const categoryOptions = useMemo(
    () => calendarOpeningCategoryOptions(calendarOpening ?? {}),
    [calendarOpening],
  );
  const categoryLabel = useMemo(() => {
    const m = new Map<string, string>(categoryOptions.map((c) => [c.id, c.label]));
    return (id: string) => m.get(id) ?? id;
  }, [categoryOptions]);

  /** カレンダー既定が複数ならすべて、なければ推定1件をラベル化 */
  const categoryLabelsForEvent = useMemo(() => {
    return (ev: Ev): string[] => {
      const cid = ev.calendarId ?? "";
      const saved = lookupCalendarCategoriesById(calendarOpening?.calendarCategoryById, cid);
      if (saved.length > 0) return saved.map((id) => categoryLabel(id));
      if (filter) return [categoryLabel(filter.infer(ev))];
      return [];
    };
  }, [calendarOpening?.calendarCategoryById, categoryLabel, filter]);

  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  /** SSR との整合のため初期 true。クライアントでは sessionStorage を useLayoutEffect で先に見る */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(forceSync: boolean) {
    try {
      const today = todayTokyoYmd();
      const qs = new URLSearchParams();
      qs.set("from", today);
      qs.set("to", today);
      qs.set("limit", "200");
      if (forceSync) qs.set("forceSync", "1");
      const res = await fetch(`/api/calendar/events?${qs.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        events?: Ev[];
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "取得に失敗しました");
        setHint(typeof data.hint === "string" ? data.hint : null);
        setEvents([]);
        return;
      }
      setError(null);
      setHint(null);
      const list = Array.isArray(data.events) ? data.events : [];
      setEvents(list);
      writeUpcomingEventsCache(today, list);
    } catch {
      setError("通信エラー");
    }
  }

  useLayoutEffect(() => {
    const today = todayTokyoYmd();
    const cached = readUpcomingEventsCache(today);
    if (cached) {
      setEvents(cached);
      setError(null);
      setHint(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void load(false).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <section className="mt-1 rounded-md border border-zinc-200 bg-zinc-50/50 p-1.5 text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 sm:mt-2 sm:rounded-lg sm:p-2 sm:text-[11px] lg:mt-8 lg:rounded-2xl lg:p-4 lg:text-sm">
        Google カレンダーを読み込み中…
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-1 rounded-md border border-amber-200 bg-amber-50/80 p-1.5 text-[11px] dark:border-amber-900/50 dark:bg-amber-950/30 sm:mt-2 sm:rounded-lg sm:p-2 sm:text-xs lg:mt-8 lg:rounded-2xl lg:p-4 lg:text-sm">
        <h2 className="font-semibold text-amber-900 dark:text-amber-100">Google カレンダー</h2>
        <p className="mt-1.5 text-amber-900/90 sm:mt-2 dark:text-amber-200/90">{error}</p>
        {hint && <p className="mt-1.5 text-[11px] text-amber-800 sm:mt-2 sm:text-xs dark:text-amber-300/90">{hint}</p>}
        <p className="mt-2 text-[11px] text-amber-800/80 sm:mt-3 sm:text-xs dark:text-amber-400/90">
          Google Cloud コンソールで「Google Calendar API」を有効にしているかも確認してください。
        </p>
        <Link href="/settings" className="mt-2 inline-block text-xs font-medium text-amber-900 underline sm:mt-3 sm:text-sm dark:text-amber-200">
          設定で Google を再連携
        </Link>
      </section>
    );
  }

  if (!events?.length) {
    return (
      <section className="mt-1 rounded-md border border-zinc-200 bg-zinc-50/50 p-1.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400 sm:mt-2 sm:rounded-lg sm:p-2 sm:text-xs lg:mt-4 lg:rounded-xl lg:p-3 lg:text-sm">
        <div className="flex items-baseline justify-between gap-1.5 sm:gap-2">
          <h2 className="text-[10px] font-semibold text-zinc-900 sm:text-[11px] lg:text-sm dark:text-zinc-100">今日の予定</h2>
          <span className="text-[9px] text-zinc-500 sm:text-[10px] lg:text-[11px] dark:text-zinc-400">{todayTokyoYmd()}</span>
        </div>
        <p className="mt-0.5 text-[10px] leading-snug sm:text-[11px] lg:mt-1 lg:text-sm">今日は予定がありません（または取得できませんでした）。</p>
      </section>
    );
  }

  const today = todayTokyoYmd();
  const todayEvents = (events ?? []).filter((e) => (filter ? filter.apply(e) : true));

  return (
    <section className="mt-1 rounded-md border border-zinc-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:mt-2 sm:rounded-lg sm:p-2 lg:mt-4 lg:rounded-xl lg:p-3">
        <div className="flex items-baseline justify-between gap-1.5 sm:gap-2 lg:gap-3">
          <div className="min-w-0">
            <h2 className="text-[10px] font-semibold leading-tight text-zinc-900 sm:text-[11px] lg:text-sm dark:text-zinc-50">
              今日の予定
            </h2>
            <span className="text-[9px] text-zinc-500 sm:text-[10px] lg:text-[11px] dark:text-zinc-400">{today}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void (async () => {
                await load(true);
                setRefreshing(false);
              })();
            }}
            className="shrink-0 rounded border border-zinc-200 bg-white px-1 py-px text-[9px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:px-1.5 sm:py-0.5 sm:text-[10px] lg:rounded-md lg:px-2 lg:text-[11px]"
            disabled={refreshing}
          >
            {refreshing ? "更新中…" : "更新"}
          </button>
        </div>

        {!todayEvents.length ? (
          <p className="mt-1 text-[10px] leading-snug text-zinc-600 sm:mt-1.5 sm:text-[11px] lg:mt-2 lg:text-sm dark:text-zinc-400">
            今日は予定がありません。
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 sm:mt-1.5 sm:space-y-1 lg:mt-2 lg:space-y-1.5">
            {todayEvents.slice(0, 10).map((ev, i) => (
              <li
                key={`${ev.start}-${i}`}
                className="rounded border border-zinc-100 bg-zinc-50/80 px-1.5 py-0.5 dark:border-zinc-800 dark:bg-zinc-900/60 sm:rounded-md sm:px-2 sm:py-1 lg:rounded-lg lg:px-2.5 lg:py-1.5"
              >
                <div className="flex items-start justify-between gap-1.5 sm:gap-2 lg:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1 truncate text-[10px] font-medium text-zinc-900 sm:gap-1.5 sm:text-[11px] lg:gap-2 lg:text-sm dark:text-zinc-100">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 lg:h-2.5 lg:w-2.5"
                        style={{ backgroundColor: resolveGcalEventColor(ev, hexMap) }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{ev.title || "（無題）"}</span>
                    </p>
                    {ev.calendarName || ev.calendarId ? (
                      <p className="mt-px text-[9px] leading-snug text-zinc-500 sm:mt-0.5 sm:text-[10px] lg:text-[11px] dark:text-zinc-400">
                        {(() => {
                          const cal = resolveCalendarDisplayNameForUser(
                            ev.calendarId ?? "",
                            ev.calendarName ?? "",
                            calendarDisplayLabelById,
                          );
                          const labs = categoryLabelsForEvent(ev);
                          if (labs.length === 0) return cal;
                          return `${cal}(${labs.join("・")})`;
                        })()}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-[9px] tabular-nums text-zinc-600 sm:text-[10px] lg:text-[11px] dark:text-zinc-300">
                    {tokyoHm(ev.start) || "終日"}
                    {ev.end ? `–${tokyoHm(ev.end) || ""}` : ""}
                  </p>
                </div>
                {(ev.location || ev.start) && (
                  <p className="mt-px truncate text-[9px] leading-snug text-zinc-500 sm:mt-0.5 sm:text-[10px] lg:text-[11px]">
                    {ev.location ? ev.location : " "}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-1 text-[9px] leading-tight text-zinc-500 sm:mt-1.5 sm:text-[10px] lg:mt-2 lg:text-[11px] lg:leading-snug dark:text-zinc-400">
          下の月表示に未来分。失敗時は{" "}
          <Link href="/settings" className="font-medium underline">
            設定で再連携
          </Link>
          。
        </p>
    </section>
  );
}
