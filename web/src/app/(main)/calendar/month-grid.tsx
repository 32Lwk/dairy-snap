"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EntryBrief = { entryDateYmd: string; title: string | null };
type Ev = { title: string; start: string; end: string; location: string };

// 月切替を速くするための軽量キャッシュ（タブ内・リロードで消える）
const monthEventsCache = new Map<string, Ev[]>();
const monthEventsInflight = new Map<string, Promise<Ev[]>>();

function tokyoYmdFromIsoLike(isoLike: string): string {
  if (!isoLike) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return isoLike;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replaceAll("/", "-");
}

function dayFromYmd(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? Number(m[3]) : 0;
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

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

async function fetchMonthEvents(ym: string): Promise<Ev[]> {
  const cached = monthEventsCache.get(ym);
  if (cached) return cached;

  const inflight = monthEventsInflight.get(ym);
  if (inflight) return inflight;

  const p = (async () => {
    const { from, to } = monthRange(ym);
    const res = await fetch(`/api/calendar/events?from=${from}&to=${to}&limit=5000`);
    const data = (await res.json().catch(() => ({}))) as { events?: Ev[] };
    const evs = Array.isArray(data.events) ? data.events : [];
    monthEventsCache.set(ym, evs);
    return evs;
  })().finally(() => {
    monthEventsInflight.delete(ym);
  });

  monthEventsInflight.set(ym, p);
  return p;
}

export function MonthGrid({
  ym,
  prevYm,
  nextYm,
  firstDow,
  daysInMonth,
  entries,
  initialEvents,
}: {
  ym: string;
  prevYm: string;
  nextYm: string;
  firstDow: number;
  daysInMonth: number;
  entries: EntryBrief[];
  initialEvents: Ev[];
}) {
  const [events, setEvents] = useState<Ev[] | null>(() => initialEvents ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cur = await fetchMonthEvents(ym);
        if (!cancelled) setEvents(cur);

        // 前後1カ月を先読み（UIをブロックしない）
        void fetchMonthEvents(prevYm);
        void fetchMonthEvents(nextYm);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ym, nextYm, prevYm]);

  const hasEntry = useMemo(() => new Set(entries.map((e) => e.entryDateYmd)), [entries]);
  const entryTitleByYmd = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.entryDateYmd, e.title ?? "");
    return m;
  }, [entries]);

  const eventsByYmd = useMemo(() => {
    const map = new Map<string, { list: Ev[]; seen: Set<string> }>();
    for (const ev of events ?? []) {
      const ymd = tokyoYmdFromIsoLike(ev.start);
      if (!ymd) continue;
      const key = `${ev.start}|${ev.end}|${ev.title}|${ev.location}`;
      if (!map.has(ymd)) map.set(ymd, { list: [], seen: new Set() });
      const bucket = map.get(ymd)!;
      if (bucket.seen.has(key)) continue;
      bucket.seen.add(key);
      bucket.list.push(ev);
    }
    // 表示安定のため開始時刻でソート
    const out = new Map<string, Ev[]>();
    for (const [ymd, v] of map) {
      out.set(
        ymd,
        v.list.slice().sort((a, b) => {
          const am = Date.parse(a.start);
          const bm = Date.parse(b.start);
          if (!Number.isFinite(am) || !Number.isFinite(bm)) return 0;
          return am - bm;
        }),
      );
    }
    return out;
  }, [events]);

  const [yy, mm] = ym.split("-").map(Number);
  const today = todayTokyoYmd();

  const cells: { day: number; ymd: string }[] = useMemo(() => {
    const arr: { day: number; ymd: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      arr.push({ day: d, ymd });
    }
    return arr;
  }, [daysInMonth, mm, yy]);

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-800 dark:text-zinc-200">日記エントリ（月）＋予定</h2>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/calendar?ym=${prevYm}`}
          scroll={false}
          className="rounded-lg border border-zinc-200 px-3 py-1 text-sm dark:border-zinc-700"
        >
          前月
        </Link>
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{ym}</span>
        <Link
          href={`/calendar?ym=${nextYm}`}
          scroll={false}
          className="rounded-lg border border-zinc-200 px-3 py-1 text-sm dark:border-zinc-700"
        >
          翌月
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map(({ day, ymd }) => {
          const has = hasEntry.has(ymd);
          const entryTitle = (entryTitleByYmd.get(ymd) ?? "").trim();
          const evs = eventsByYmd.get(ymd) ?? [];
          const isToday = ymd === today;
          const evTitles = evs.slice(0, 3).map((e) => e.title || "（無題）");
          const titleLines = [
            ymd,
            ...(has && entryTitle ? [`日記: ${entryTitle}`] : []),
            ...(evs.length ? [`予定: ${evTitles.join(" / ")}${evs.length > 3 ? " …" : ""}`] : []),
          ].join("\n");

          return (
            <Link
              key={ymd}
              href={`/entries/${ymd}`}
              title={titleLines}
              className={[
                "group block h-[88px] rounded-lg border px-2 py-2 text-left",
                has
                  ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
                  : "border-zinc-100 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900",
                isToday ? "ring-1 ring-zinc-400/40 dark:ring-zinc-500/40" : "",
              ].join(" ")}
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums">{day}</span>
                  {evs.length ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                      {evs.length}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 min-h-0 flex-1">
                  {evs.length ? (
                    <ul className="space-y-0.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
                      {evs.slice(0, 2).map((e, idx) => (
                        <li key={`${ymd}-ev-${idx}`} className="flex items-start gap-1.5">
                          <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span className="min-w-0 flex-1 truncate">{e.title || "（無題）"}</span>
                        </li>
                      ))}
                      {evs.length > 2 ? (
                        <li className="text-[11px] text-zinc-500 dark:text-zinc-400">…+{evs.length - 2}</li>
                      ) : null}
                    </ul>
                  ) : (
                    <div className="h-[28px]" />
                  )}
                </div>

                {has && entryTitle ? (
                  <div className="mt-0.5 truncate text-[11px] leading-snug text-blue-700/80 dark:text-blue-200/80">
                    {entryTitle}
                  </div>
                ) : (
                  <div className="mt-0.5 truncate text-[11px] leading-snug text-zinc-400 dark:text-zinc-600"> </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        各日をクリックすると日記ページに移動します（ツールチップに予定の概要も表示します）。
      </p>
    </>
  );
}

