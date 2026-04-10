"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CALENDAR_GRID_COLOR_PRESETS, GCAL_COLOR_MAP } from "@/lib/gcal-event-color";
import {
  type CalendarOpeningCategory,
  type CalendarOpeningRule,
  type CalendarOpeningSettings,
  type CalendarWeekStartDay,
  CALENDAR_DEFAULT_CATEGORY_WEIGHT,
  calendarOpeningCategoryOptions,
  labelToUserCategoryId,
  normalizeCalendarGridDisplay,
  normalizeCalendarOpeningPriorityOrder,
  stripCalendarOpeningCustomLabel,
} from "@/lib/user-settings";
import { UpcomingGoogleEvents } from "./upcoming-google-events";
import { MonthGrid } from "./month-grid";

type EntryBrief = { entryDateYmd: string; title: string | null };
type Ev = {
  title: string;
  start: string;
  end: string;
  location: string;
  calendarName?: string;
  colorId?: string;
  calendarId?: string;
  description?: string;
};

const CALENDAR_WEEK_START_OPTIONS: { value: CalendarWeekStartDay; label: string }[] = [
  { value: 0, label: "日曜始まり" },
  { value: 1, label: "月曜始まり" },
  { value: 2, label: "火曜始まり" },
  { value: 3, label: "水曜始まり" },
  { value: 4, label: "木曜始まり" },
  { value: 5, label: "金曜始まり" },
  { value: 6, label: "土曜始まり" },
];

function inferCategoryForEvent(ev: Ev, settings: CalendarOpeningSettings | null): CalendarOpeningCategory {
  const rules = settings?.rules ?? [];
  const priority = normalizeCalendarOpeningPriorityOrder(settings);
  const hayTitle = (ev.title ?? "").toLowerCase();
  const hayLoc = (ev.location ?? "").toLowerCase();
  const hayDesc = (ev.description ?? "").toLowerCase();
  const scores = new Map<CalendarOpeningCategory, number>();
  const add = (cat: CalendarOpeningCategory, w: number) => {
    scores.set(cat, (scores.get(cat) ?? 0) + w);
  };
  const calDefault = settings?.calendarCategoryById?.[ev.calendarId ?? ""];
  if (calDefault) add(calDefault, CALENDAR_DEFAULT_CATEGORY_WEIGHT);
  for (const r of rules) {
    const w = typeof r.weight === "number" ? r.weight : 5;
    const v = (r.value ?? "").toLowerCase();
    if (!v) continue;
    if (r.kind === "calendarId") {
      if (ev.calendarId && ev.calendarId === r.value) add(r.category, w);
      continue;
    }
    if (r.kind === "colorId") {
      if (ev.colorId && ev.colorId === r.value) add(r.category, w);
      continue;
    }
    if (r.kind === "keyword") {
      if (hayTitle.includes(v)) add(r.category, w);
      continue;
    }
    if (r.kind === "location") {
      if (hayLoc.includes(v)) add(r.category, w);
      continue;
    }
    if (r.kind === "description") {
      if (hayDesc.includes(v)) add(r.category, w);
      continue;
    }
  }
  // 何も当たらないときは other
  add("other", 1);
  let best: CalendarOpeningCategory = "other";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const cat of priority) {
    const s = scores.get(cat) ?? Number.NEGATIVE_INFINITY;
    if (s > bestScore) {
      bestScore = s;
      best = cat;
    }
  }
  return best;
}

export function CalendarClient(props: {
  ym: string;
  prevYm: string;
  nextYm: string;
  /** 当月1日の getDay()（0=日曜） */
  monthStartWeekday: number;
  daysInMonth: number;
  entries: EntryBrief[];
  initialEvents: Ev[];
}) {
  const [opening, setOpening] = useState<CalendarOpeningSettings | null>(null);
  const [opts, setOpts] = useState<{
    calendars: { calendarId: string; calendarName: string; calendarColorId: string }[];
    colorIds: string[];
  } | null>(null);
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<CalendarOpeningCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customCatDraft, setCustomCatDraft] = useState("");
  const [activeCalendarId, setActiveCalendarId] = useState<string>("");

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const cals = opts?.calendars ?? [];
    if (!cals.length) {
      setActiveCalendarId("");
      return;
    }
    setActiveCalendarId((prev) =>
      prev && cals.some((x) => x.calendarId === prev) ? prev : cals[0]!.calendarId,
    );
  }, [settingsOpen, opts?.calendars]);

  useEffect(() => {
    // settings: calendarOpening
    void (async () => {
      const res = await fetch("/api/settings", { cache: "no-store", credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) return;
      if (!json || typeof json !== "object" || Array.isArray(json)) return;
      const o = json as Record<string, unknown>;
      const profile = o.profile && typeof o.profile === "object" && !Array.isArray(o.profile) ? (o.profile as Record<string, unknown>) : null;
      const calendarOpening =
        profile && profile.calendarOpening && typeof profile.calendarOpening === "object" && !Array.isArray(profile.calendarOpening)
          ? (profile.calendarOpening as CalendarOpeningSettings)
          : null;
      setOpening(calendarOpening);
    })();
  }, []);

  useEffect(() => {
    // classifier options (calendar list / colors) from cache
    void (async () => {
      const res = await fetch("/api/calendar/classifier-options", { cache: "no-store", credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) return;
      if (!json || typeof json !== "object" || Array.isArray(json)) return;
      const o = json as Record<string, unknown>;
      const calendarsRaw = o.calendars;
      const colorIdsRaw = o.colorIds;
      const calendars = Array.isArray(calendarsRaw)
        ? calendarsRaw
            .filter((x): x is { calendarId: string; calendarName: string; calendarColorId: string } => {
              if (!x || typeof x !== "object" || Array.isArray(x)) return false;
              const r = x as Record<string, unknown>;
              return (
                typeof r.calendarId === "string" &&
                typeof r.calendarName === "string" &&
                typeof r.calendarColorId === "string"
              );
            })
            .slice(0, 200)
        : [];
      const colorIds = Array.isArray(colorIdsRaw)
        ? colorIdsRaw.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 200)
        : [];
      setOpts({ calendars, colorIds });
    })();
  }, []);

  const effectivePriority = useMemo(() => normalizeCalendarOpeningPriorityOrder(opening), [opening]);

  const catOptions = useMemo(() => calendarOpeningCategoryOptions(opening), [opening]);

  const ruleCats = useMemo(() => catOptions.map(({ id, label }) => ({ id, label })), [catOptions]);

  const gridDisplay = useMemo(() => normalizeCalendarGridDisplay(opening?.gridDisplay), [opening?.gridDisplay]);

  const activeCalendar = useMemo(() => {
    const cals = opts?.calendars ?? [];
    return cals.find((c) => c.calendarId === activeCalendarId) ?? null;
  }, [opts?.calendars, activeCalendarId]);

  const noDisplayFilter = selectedCalendars.length === 0 && selectedCats.length === 0;

  async function saveCalendarOpening(next: CalendarOpeningSettings) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { calendarOpening: next } }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      // 再取得は重いのでローカルを更新
      setOpening(next);
    } finally {
      setBusy(false);
    }
  }

  async function addCustomCategory() {
    const lab = customCatDraft.normalize("NFKC").trim();
    if (!lab) return;
    if (lab.length > 24) {
      setErr("カテゴリ名は24文字以内にしてください");
      return;
    }
    const id = labelToUserCategoryId(lab);
    const labels = opening?.customCategoryLabels ?? [];
    const existing = new Set(labels.map((x) => labelToUserCategoryId(x)));
    if (existing.has(id)) {
      setErr("同じカテゴリが既にあります");
      return;
    }
    if (labels.length >= 16) {
      setErr("カスタムカテゴリは16件までです");
      return;
    }
    setErr(null);
    setCustomCatDraft("");
    await saveCalendarOpening({
      ...(opening ?? {}),
      customCategoryLabels: [...labels, lab],
    });
  }

  const filterSettings = useMemo(() => {
    const selectedCalendarSet = new Set(selectedCalendars);
    const selectedCatSet = new Set(selectedCats);
    const hasCalendarFilter = selectedCalendars.length > 0;
    const hasCatFilter = selectedCats.length > 0;
    return {
      selectedCalendars,
      selectedCats,
      apply(ev: Ev): boolean {
        if (hasCalendarFilter) {
          const cid = ev.calendarId ?? "";
          if (!cid || !selectedCalendarSet.has(cid)) return false;
        }
        if (hasCatFilter) {
          const cat = inferCategoryForEvent(ev, opening);
          if (!selectedCatSet.has(cat)) return false;
        }
        return true;
      },
      infer(ev: Ev): CalendarOpeningCategory {
        return inferCategoryForEvent(ev, opening);
      },
    };
  }, [opening, selectedCalendars, selectedCats]);

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold text-zinc-900 dark:text-zinc-50">カレンダー</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          aria-controls="calendar-display-settings-dialog"
          aria-label="表示・分類設定を開く"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 011.262.125l.962.962a1 1 0 01.125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.416l.834 1.25a1 1 0 01-1.262.125l-.962-.962a6.95 6.95 0 01-1.416.587l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.95 6.95 0 01-1.416-.587l-1.25.834a1 1 0 01-1.262-.125l-.962-.962a1 1 0 01-.125-1.262l.834-1.25a6.95 6.95 0 01-.587-1.416l-1.473-.294A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 01.125-1.262l.962-.962A1 1 0 015.38 3.03l1.25.834a6.95 6.95 0 011.416-.587l.294-1.473zM13 10a3 3 0 11-6 0 3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="hidden sm:inline">設定</span>
        </button>
      </header>

      <UpcomingGoogleEvents filter={filterSettings} calendarHexById={gridDisplay.calendarHexById} />

      <div className="mt-2 space-y-1.5">
        <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">表示の絞り込み</p>
        <div
          className="-mx-4 overflow-x-auto overflow-y-hidden px-4 pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] sm:-mx-0 sm:px-0"
          aria-label="表示の絞り込み（横にスクロール）"
        >
          <div className="flex w-max flex-nowrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedCalendars([]);
                setSelectedCats([]);
              }}
              className={[
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                noDisplayFilter
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
              ].join(" ")}
            >
              すべて
            </button>
            {(opts?.calendars ?? []).map((c) => {
              const on = selectedCalendars.includes(c.calendarId);
              return (
                <button
                  key={c.calendarId}
                  type="button"
                  onClick={() => {
                    setSelectedCalendars((prev) =>
                      prev.includes(c.calendarId) ? prev.filter((x) => x !== c.calendarId) : [...prev, c.calendarId],
                    );
                  }}
                  className={[
                    "max-w-[11rem] shrink-0 truncate rounded-full border px-3 py-1 text-xs font-medium",
                    on
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
                  ].join(" ")}
                  title={c.calendarName}
                >
                  {c.calendarName}
                </button>
              );
            })}
            {catOptions.map((c) => {
              const on = selectedCats.includes(c.id);
              const selectedCls = c.custom
                ? "border-violet-600 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                : "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-100";
              const idleCls =
                "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCats((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                  }}
                  className={["shrink-0 rounded-full border px-3 py-1 text-xs font-medium", on ? selectedCls : idleCls].join(
                    " ",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          ※ 表示のみ。Google の予定データは変わりません。詳細は右上の設定からも変更できます。
        </p>
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-950/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            id="calendar-display-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-display-settings-title"
            className="relative mt-0 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <h2 id="calendar-display-settings-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  表示・分類設定
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  月グリッドの見た目・カレンダーごとの色と分類・分類ルールを設定します。一覧の絞り込みは画面上部のチップから行えます。
                </p>
                {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  閉じる
                </button>
                <Link href="/settings" className="text-[11px] text-zinc-500 underline dark:text-zinc-400">
                  設定（全体）へ
                </Link>
              </div>
            </div>

        <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">月カレンダーの見た目</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              週の始まり・1マスあたりの予定行数・カレンダー別のドット色を変えられます（画面表示のみ）。
            </p>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
            週の始まり
            <select
              disabled={busy}
              value={gridDisplay.weekStartsOn}
              onChange={(e) => {
                const v = Number(e.target.value) as CalendarWeekStartDay;
                setOpening((prev) => ({
                  ...(prev ?? {}),
                  gridDisplay: { ...normalizeCalendarGridDisplay(prev?.gridDisplay), weekStartsOn: v },
                }));
              }}
              className="min-w-[9.5rem] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              {CALENDAR_WEEK_START_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
            1マスに並べる予定（最大）
            <select
              disabled={busy}
              value={gridDisplay.maxEventsPerCell}
              onChange={(e) => {
                const n = Number(e.target.value);
                setOpening((prev) => ({
                  ...(prev ?? {}),
                  gridDisplay: { ...normalizeCalendarGridDisplay(prev?.gridDisplay), maxEventsPerCell: n },
                }));
              }}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}件
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">カレンダーごとの色・分類</p>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              プルダウンで1つずつ選び、ドット色と分類のデフォルトを設定します。
            </p>
            {!opts?.calendars?.length ? (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">（カレンダー一覧は予定同期後に出ます）</p>
            ) : (
              <>
                <label className="mt-2 block text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                  対象カレンダー
                  <select
                    disabled={busy}
                    value={activeCalendarId}
                    onChange={(e) => setActiveCalendarId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-900 shadow-sm outline-none ring-zinc-400 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
                  >
                    {(opts.calendars ?? []).map((cal) => {
                      const tag: string[] = [];
                      if (opening?.calendarCategoryById?.[cal.calendarId]) tag.push("分類");
                      if (gridDisplay.calendarHexById[cal.calendarId]) tag.push("色");
                      const suffix = tag.length ? ` · ${tag.join("・")}` : "";
                      return (
                        <option key={cal.calendarId} value={cal.calendarId}>
                          {cal.calendarName}
                          {suffix}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {activeCalendar ? (
                  <div className="mt-3 space-y-3">
                    {(() => {
                      const cal = activeCalendar;
                      const defHex = (GCAL_COLOR_MAP[cal.calendarColorId] ?? "#10b981").toLowerCase();
                      const override = gridDisplay.calendarHexById[cal.calendarId];
                      const shownRaw = (override ?? defHex).toLowerCase();
                      const shown = /^#[0-9a-f]{6}$/i.test(shownRaw) ? shownRaw : defHex;
                      return (
                        <CalendarDotColorPicker
                          detailTitle={cal.calendarId}
                          calendarName={cal.calendarName}
                          shownHex={shown}
                          busy={busy}
                          hasOverride={Boolean(override)}
                          onSelectHex={(hex) => {
                            const lower = hex.toLowerCase();
                            setOpening((prev) => {
                              const base = normalizeCalendarGridDisplay(prev?.gridDisplay);
                              const nextHex = { ...base.calendarHexById };
                              if (lower === defHex) delete nextHex[cal.calendarId];
                              else nextHex[cal.calendarId] = lower;
                              return { ...(prev ?? {}), gridDisplay: { ...base, calendarHexById: nextHex } };
                            });
                          }}
                          onClearOverride={() =>
                            setOpening((prev) => {
                              const base = normalizeCalendarGridDisplay(prev?.gridDisplay);
                              const nextHex = { ...base.calendarHexById };
                              delete nextHex[cal.calendarId];
                              return { ...(prev ?? {}), gridDisplay: { ...base, calendarHexById: nextHex } };
                            })
                          }
                        />
                      );
                    })()}
                    <div className="rounded-xl border border-zinc-200/90 bg-gradient-to-b from-white to-violet-50/40 p-3 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-violet-950/20">
                      <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200" id="calendar-assign-category-label">
                        このカレンダーの予定の分類
                      </p>
                      <div
                        className="mt-2 flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-labelledby="calendar-assign-category-label"
                      >
                        {(() => {
                          const calId = activeCalendar.calendarId;
                          const assigned = opening?.calendarCategoryById?.[calId];
                          const autoOn = !assigned;
                          const setCategoryForCal = (cat: CalendarOpeningCategory | null) => {
                            setOpening((prev) => {
                              const next: CalendarOpeningSettings = { ...(prev ?? {}) };
                              const map = { ...(next.calendarCategoryById ?? {}) };
                              if (cat == null) delete map[calId];
                              else map[calId] = cat;
                              if (Object.keys(map).length === 0) delete next.calendarCategoryById;
                              else next.calendarCategoryById = map;
                              return next;
                            });
                          };
                          return (
                            <>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={autoOn}
                                disabled={busy}
                                onClick={() => setCategoryForCal(null)}
                                className={[
                                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                  autoOn
                                    ? "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
                                ].join(" ")}
                              >
                                自動
                              </button>
                              {catOptions.map((c) => {
                                const on = assigned === c.id;
                                const selectedCls = c.custom
                                  ? "border-violet-600 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                                  : "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-100";
                                const idleCls =
                                  "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";
                                return (
                                  <span key={c.id} className="inline-flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      role="radio"
                                      aria-checked={on}
                                      disabled={busy}
                                      onClick={() => setCategoryForCal(c.id)}
                                      className={["rounded-full border px-3 py-1 text-xs font-medium", on ? selectedCls : idleCls].join(
                                        " ",
                                      )}
                                    >
                                      {c.label}
                                    </button>
                                    {c.custom && opening ? (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        title="カテゴリを削除"
                                        className="rounded-full px-1.5 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                                        onClick={() => {
                                          void saveCalendarOpening(stripCalendarOpeningCustomLabel(opening, c.label));
                                          setSelectedCats((prev) => prev.filter((x) => x !== c.id));
                                        }}
                                      >
                                        ×
                                      </button>
                                    ) : null}
                                  </span>
                                );
                              })}
                              <input
                                value={customCatDraft}
                                onChange={(e) => setCustomCatDraft(e.target.value)}
                                maxLength={24}
                                disabled={busy}
                                placeholder="カスタム名（例: 旅行）"
                                aria-label="カスタムカテゴリ名"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void addCustomCategory();
                                  }
                                }}
                                className="min-w-[9rem] max-w-[14rem] rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-900 outline-none ring-zinc-400 placeholder:font-normal placeholder:text-zinc-400 focus-visible:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-500"
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void addCustomCategory()}
                                className="rounded-full border border-violet-500/70 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100/80 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/60"
                              >
                                追加
                              </button>
                            </>
                          );
                        })()}
                      </div>
                      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        1つだけ選べます。「自動」はキーワード・ルール優先です。細かい条件は下の「分類ルール」でも追加できます。
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void saveCalendarOpening({
                ...(opening ?? {}),
                gridDisplay: {
                  weekStartsOn: gridDisplay.weekStartsOn,
                  maxEventsPerCell: gridDisplay.maxEventsPerCell,
                  calendarHexById: { ...gridDisplay.calendarHexById },
                },
              })
            }
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            表示・カレンダー別の設定を保存
          </button>
        </div>

        <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
          <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            分類ルール/優先順位を編集
          </summary>

          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">カテゴリの優先順位（上ほど優先）</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {effectivePriority.map((cat, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="w-6 shrink-0 text-[11px] text-zinc-500">#{idx + 1}</span>
                    <select
                      value={cat}
                      disabled={busy}
                      onChange={(e) => {
                        const cur = [...effectivePriority];
                        cur[idx] = e.target.value as CalendarOpeningCategory;
                        setOpening((prev) => ({ ...(prev ?? {}), priorityOrder: cur }));
                      }}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {catOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.custom ? `${c.label}（カスタム）` : c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void saveCalendarOpening({
                    ...(opening ?? {}),
                    priorityOrder: normalizeCalendarOpeningPriorityOrder(opening),
                    rules: opening?.rules ?? [],
                  })
                }
                className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                優先順位を保存
              </button>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">分類ルール</p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                キーワード/カレンダー/色/場所/メモに含まれる文字でカテゴリを加点します（部分一致）。
              </p>

              <div className="mt-2 space-y-2">
                {(opening?.rules ?? []).map((r, i) => (
                  <RuleRow
                    key={i}
                    rule={r}
                    disabled={busy}
                    cats={ruleCats}
                    calendars={opts?.calendars ?? []}
                    colorIds={opts?.colorIds ?? []}
                    onChange={(next) => {
                      const rules = [...(opening?.rules ?? [])];
                      rules[i] = next;
                      setOpening((prev) => ({ ...(prev ?? {}), rules }));
                    }}
                    onRemove={() => {
                      const rules = [...(opening?.rules ?? [])];
                      rules.splice(i, 1);
                      setOpening((prev) => ({ ...(prev ?? {}), rules }));
                    }}
                  />
                ))}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const rules = [...(opening?.rules ?? [])];
                    rules.push({ kind: "keyword", value: "", category: "other", weight: 5 });
                    setOpening((prev) => ({ ...(prev ?? {}), rules }));
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950"
                >
                  ルールを追加
                </button>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void saveCalendarOpening({
                    ...(opening ?? {}),
                    priorityOrder: normalizeCalendarOpeningPriorityOrder(opening),
                    rules: opening?.rules ?? [],
                  })
                }
                className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                ルールを保存
              </button>
            </div>
          </div>
        </details>
          </section>
        </div>
      ) : null}

      <MonthGrid
        ym={props.ym}
        prevYm={props.prevYm}
        nextYm={props.nextYm}
        monthStartWeekday={props.monthStartWeekday}
        weekStartsOn={gridDisplay.weekStartsOn}
        maxEventsPerCell={gridDisplay.maxEventsPerCell}
        calendarHexById={gridDisplay.calendarHexById}
        daysInMonth={props.daysInMonth}
        entries={props.entries}
        initialEvents={props.initialEvents}
        filter={filterSettings}
      />
    </>
  );
}

const PRESET_HEX_SET = new Set(CALENDAR_GRID_COLOR_PRESETS.map((h) => h.toLowerCase()));

function CalendarDotColorPicker({
  detailTitle,
  calendarName,
  shownHex,
  busy,
  hasOverride,
  onSelectHex,
  onClearOverride,
}: {
  detailTitle: string;
  calendarName: string;
  shownHex: string;
  busy: boolean;
  hasOverride: boolean;
  onSelectHex: (hex: string) => void;
  onClearOverride: () => void;
}) {
  const safe = shownHex.toLowerCase();
  const isCustom = !PRESET_HEX_SET.has(safe);

  const swatchRing =
    "ring-2 ring-zinc-900 ring-offset-2 ring-offset-zinc-50 dark:ring-zinc-100 dark:ring-offset-zinc-950";

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 p-2.5 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-950/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-100" title={detailTitle}>
            {calendarName}
          </p>
        </div>
        {hasOverride ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClearOverride}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            デフォルト
          </button>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {CALENDAR_GRID_COLOR_PRESETS.map((hex) => {
          const lower = hex.toLowerCase();
          const selected = safe === lower;
          return (
            <button
              key={lower}
              type="button"
              disabled={busy}
              onClick={() => onSelectHex(lower)}
              title={lower}
              aria-label={`${calendarName}の表示色を${lower}にする`}
              aria-pressed={selected}
              style={{ backgroundColor: lower }}
              className={[
                "h-8 w-8 shrink-0 rounded-full border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-white/15 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                selected ? swatchRing : "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950",
              ].join(" ")}
            />
          );
        })}
        <label
          className={[
            "relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed transition-transform hover:scale-105",
            isCustom ? `${swatchRing} border-zinc-400 dark:border-zinc-500` : "border-zinc-300 dark:border-zinc-600",
          ].join(" ")}
          style={
            isCustom
              ? { backgroundColor: safe }
              : {
                  background:
                    "conic-gradient(from 180deg at 50% 50%, #f472b6, #a78bfa, #60a5fa, #34d399, #fbbf24, #f87171, #f472b6)",
                }
          }
          title="自由に色を指定"
        >
          <span className="sr-only">{calendarName}の色をカスタムで指定</span>
          {!isCustom ? (
            <span
              className="pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-[10px] font-bold text-zinc-700 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-200"
              aria-hidden
            >
              +
            </span>
          ) : null}
          <input
            type="color"
            disabled={busy}
            value={safe}
            onChange={(e) => onSelectHex(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${calendarName}のカスタム色`}
          />
        </label>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  disabled,
  cats,
  calendars,
  colorIds,
  onChange,
  onRemove,
}: {
  rule: CalendarOpeningRule;
  disabled: boolean;
  cats: { id: CalendarOpeningCategory; label: string }[];
  calendars: { calendarId: string; calendarName: string; calendarColorId: string }[];
  colorIds: string[];
  onChange: (next: CalendarOpeningRule) => void;
  onRemove: () => void;
}) {
  const kind = rule.kind;
  const valueInput =
    kind === "calendarId" ? (
      <select
        value={rule.value}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="">（選ぶ）</option>
        {calendars.map((c) => (
          <option key={c.calendarId} value={c.calendarId}>
            {c.calendarName} ({c.calendarId})
          </option>
        ))}
      </select>
    ) : kind === "colorId" ? (
      <select
        value={rule.value}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="">（選ぶ）</option>
        {colorIds.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    ) : (
      <input
        value={rule.value}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        placeholder={kind === "keyword" ? "例: 面接 / シフト / デート" : kind === "location" ? "例: #jobhunt" : "例: #tag"}
      />
    );

  return (
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800 sm:grid-cols-12 sm:items-center">
      <select
        value={rule.kind}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, kind: e.target.value as CalendarOpeningRule["kind"], value: "" })}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-3"
      >
        <option value="keyword">キーワード</option>
        <option value="calendarId">カレンダー</option>
        <option value="colorId">色</option>
        <option value="location">場所</option>
        <option value="description">メモ</option>
      </select>
      <div className="sm:col-span-4">{valueInput}</div>
      <select
        value={rule.category}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, category: e.target.value as CalendarOpeningCategory })}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-3"
      >
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        value={rule.weight ?? 5}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, weight: Number(e.target.value) })}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-1"
        inputMode="numeric"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="rounded-lg px-2 py-1 text-xs text-red-600 underline disabled:opacity-50 dark:text-red-400 sm:col-span-1"
      >
        削除
      </button>
    </div>
  );
}

