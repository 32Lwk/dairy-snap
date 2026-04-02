"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Ev = { title: string; start: string; end: string; location: string };

export function UpcomingGoogleEvents() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/calendar/events");
        const data = (await res.json().catch(() => ({}))) as {
          events?: Ev[];
          error?: string;
          hint?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "取得に失敗しました");
          setHint(typeof data.hint === "string" ? data.hint : null);
          setEvents([]);
          return;
        }
        setEvents(Array.isArray(data.events) ? data.events : []);
      } catch {
        if (!cancelled) setError("通信エラー");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Google カレンダー（未来30日）</h2>
        <p className="mt-2">予定はありません（または取得できませんでした）。</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Google カレンダー（未来30日）</h2>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
        {events.slice(0, 20).map((ev, i) => (
          <li
            key={`${ev.start}-${i}`}
            className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{ev.title || "（無題）"}</p>
            <p className="text-xs text-zinc-500">
              {ev.start}
              {ev.end ? ` — ${ev.end}` : ""}
              {ev.location ? ` · ${ev.location}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
