"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { resolveGcalEventColor } from "@/lib/gcal-event-color";
import { GithubGrassStrip, githubGrassLevel } from "@/components/github-grass-strip";
type EntryBrief = { entryDateYmd: string; title: string | null };
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

const listMonthCache = new Map<string, Ev[]>();
const listMonthInflight = new Map<string, Promise<Ev[]>>();

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

async function fetchMonthEventsList(ym: string): Promise<Ev[]> {
  const cached = listMonthCache.get(ym);
  if (cached) return cached;
  const inflight = listMonthInflight.get(ym);
  if (inflight) return inflight;
  const p = (async () => {
    const { from, to } = monthRange(ym);
    const res = await fetch(`/api/calendar/events?from=${from}&to=${to}&limit=5000`);
    const data = (await res.json().catch(() => ({}))) as { events?: Ev[] };
    const evs = Array.isArray(data.events) ? data.events : [];
    listMonthCache.set(ym, evs);
    return evs;
  })().finally(() => listMonthInflight.delete(ym));
  listMonthInflight.set(ym, p);
  return p;
}

export function peekMonthListEventsCache(ym: string): Ev[] | undefined {
  return listMonthCache.get(ym);
}

export function invalidateMonthListEventsCache(ym?: string) {
  if (ym) {
    listMonthCache.delete(ym);
    listMonthInflight.delete(ym);
    return;
  }
  listMonthCache.clear();
  listMonthInflight.clear();
}

export function MonthList({
  ym,
  prevYm,
  nextYm,
  daysInMonth,
  entries,
  initialEvents,
  calendarHexById,
  selectedDateYmd,
  filter,
  onDayActivate,
  showGithubGrass = false,
  githubByYmd = null,
}: {
  ym: string;
  prevYm: string;
  nextYm: string;
  daysInMonth: number;
  entries: EntryBrief[];
  initialEvents: Ev[];
  calendarHexById: Record<string, string>;
  selectedDateYmd?: string;
  filter?: { apply: (ev: Ev) => boolean; infer: (ev: Ev) => string };
  onDayActivate?: (ymd: string, e: MouseEvent<HTMLAnchorElement>) => void;
  showGithubGrass?: boolean;
  githubByYmd?: Record<string, number> | null;
}) {
  const [events, setEvents] = useState<Ev[] | null>(() => initialEvents ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cur = await fetchMonthEventsList(ym);
        if (!cancelled) setEvents(cur);
        void fetchMonthEventsList(prevYm);
        void fetchMonthEventsList(nextYm);
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

  const visibleEvents = useMemo(() => {
    const evs = events ?? [];
    return filter ? evs.filter((e) => filter.apply(e)) : evs;
  }, [events, filter]);

  const eventsByYmd = useMemo(() => {
    const map = new Map<string, { list: Ev[]; seen: Set<string> }>();
    for (const ev of visibleEvents) {
      const ymd = tokyoYmdFromIsoLike(ev.start);
      if (!ymd) continue;
      const key = `${ev.start}|${ev.end}|${ev.title}|${ev.location}`;
      if (!map.has(ymd)) map.set(ymd, { list: [], seen: new Set() });
      const bucket = map.get(ymd)!;
      if (bucket.seen.has(key)) continue;
      bucket.seen.add(key);
      bucket.list.push(ev);
    }
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
  }, [visibleEvents]);

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

  const githubMonthMax = useMemo(() => {
    if (!showGithubGrass || !githubByYmd) return 0;
    let m = 0;
    for (const { ymd } of cells) {
      const c = githubByYmd[ymd] ?? 0;
      if (c > m) m = c;
    }
    return m;
  }, [showGithubGrass, githubByYmd, cells]);

  return (
    <>
      <h2 className="mb-2 mt-3 text-xs font-semibold text-zinc-800 sm:mb-3 sm:mt-6 sm:text-sm lg:mb-2 lg:mt-5 dark:text-zinc-200">
        日記エントリ（月）リスト
      </h2>
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 sm:mb-3 lg:mb-2 lg:gap-1.5">
        <Link
          href={`/calendar/${prevYm}-01`}
          scroll={false}
          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs sm:px-3 sm:text-sm dark:border-zinc-700"
        >
          前月
        </Link>
        <span className="min-w-0 shrink truncate text-center text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {ym}
        </span>
        <Link
          href={`/calendar/${nextYm}-01`}
          scroll={false}
          className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs sm:px-3 sm:text-sm dark:border-zinc-700"
        >
          翌月
        </Link>
      </div>

      <ul className="space-y-2">
        {cells.map(({ day, ymd }) => {
          const has = hasEntry.has(ymd);
          const entryTitle = (entryTitleByYmd.get(ymd) ?? "").trim();
          const evs = eventsByYmd.get(ymd) ?? [];
          const isToday = ymd === today;
          const isSelected = selectedDateYmd === ymd;
          return (
            <li key={ymd}>
              <Link
                href={`/calendar/${ymd}`}
                onClick={onDayActivate ? (e) => onDayActivate(ymd, e) : undefined}
                className={[
                  "flex min-h-12 min-w-0 flex-col gap-1 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition-colors sm:px-3",
                  has
                    ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                  isToday ? "ring-1 ring-zinc-400/50 dark:ring-zinc-500/50" : "",
                  isSelected ? "ring-2 ring-emerald-500/80 dark:ring-emerald-400/80" : "",
                ].join(" ")}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 sm:text-sm">
                    {ymd}（{day}日）
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {showGithubGrass && githubByYmd ? (
                      <GithubGrassStrip
                        className="mt-0"
                        level={githubGrassLevel(githubByYmd[ymd] ?? 0, githubMonthMax)}
                      />
                    ) : null}
                    {evs.length > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                        予定 {evs.length}
                      </span>
                    ) : null}
                  </div>
                </div>
                {has && entryTitle ? (
                  <p className="truncate text-xs text-blue-800 dark:text-blue-200">日記: {entryTitle}</p>
                ) : null}
                {evs.length > 0 ? (
                  <ul className="space-y-0.5 border-t border-zinc-100 pt-1 dark:border-zinc-800">
                    {evs.slice(0, 6).map((e, idx) => (
                      <li key={`${ymd}-ev-${idx}`} className="flex items-start gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                        <span
                          className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: resolveGcalEventColor(e, calendarHexById) }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">{e.title || "（無題）"}</span>
                      </li>
                    ))}
                    {evs.length > 6 ? (
                      <li className="text-[11px] text-zinc-500">…他 {evs.length - 6} 件</li>
                    ) : null}
                  </ul>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
