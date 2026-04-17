"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveGcalEventColor } from "@/lib/gcal-event-color";

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

export function UpcomingGoogleEvents({
  filter,
  calendarHexById,
}: {
  filter?: { apply: (ev: Ev) => boolean; infer: (ev: Ev) => string };
  calendarHexById?: Record<string, string>;
}) {
  const hexMap = calendarHexById ?? {};
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
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
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError("通信エラー");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load(false);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
        Google カレンダー（未来30日）を読み込み中…
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
        <h2 className="font-semibold text-amber-900 dark:text-amber-100">Google カレンダー</h2>
        <p className="mt-2 text-amber-900/90 dark:text-amber-200/90">{error}</p>
        {hint && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300/90">{hint}</p>}
        <p className="mt-3 text-xs text-amber-800/80 dark:text-amber-400/90">
          Google Cloud コンソールで「Google Calendar API」を有効にしているかも確認してください。
        </p>
        <Link href="/settings" className="mt-3 inline-block text-sm font-medium text-amber-900 underline dark:text-amber-200">
          設定で Google を再連携
        </Link>
      </section>
    );
  }

  if (!events?.length) {
    return (
      <section className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">今日の予定</h2>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{todayTokyoYmd()}</span>
        </div>
        <p className="mt-1 text-sm leading-snug">今日は予定がありません（または取得できませんでした）。</p>
      </section>
    );
  }

  const today = todayTokyoYmd();
  const todayEvents = (events ?? []).filter((e) => (filter ? filter.apply(e) : true));

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">今日の予定</h2>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{today}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void load(true).finally(() => setRefreshing(false));
            }}
            className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            disabled={refreshing}
          >
            {refreshing ? "更新中…" : "更新"}
          </button>
        </div>

        {!todayEvents.length ? (
          <p className="mt-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">今日は予定がありません。</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {todayEvents.slice(0, 10).map((ev, i) => (
              <li
                key={`${ev.start}-${i}`}
                className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2 truncate font-medium text-zinc-900 dark:text-zinc-100">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: resolveGcalEventColor(ev, hexMap) }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{ev.title || "（無題）"}</span>
                    </p>
                    {ev.calendarName ? (
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {ev.calendarName}
                        {filter ? ` · ${filter.infer(ev)}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                    {tokyoHm(ev.start) || "終日"}
                    {ev.end ? `–${tokyoHm(ev.end) || ""}` : ""}
                  </p>
                </div>
                {(ev.location || ev.start) && (
                  <p className="mt-0.5 truncate text-[11px] leading-snug text-zinc-500">
                    {ev.location ? ev.location : " "}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          未来の予定は下の月カレンダーに表示します。取得に失敗する場合は{" "}
          <Link href="/settings" className="font-medium underline">
            設定で Google を再連携
          </Link>
          してください。
        </p>
    </section>
  );
}
