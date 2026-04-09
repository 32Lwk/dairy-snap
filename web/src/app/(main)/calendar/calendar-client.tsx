"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CalendarOpeningCategory,
  CalendarOpeningRule,
  CalendarOpeningSettings,
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

const CATS: { id: CalendarOpeningCategory; label: string }[] = [
  { id: "job_hunt", label: "就活/面接" },
  { id: "parttime", label: "バイト/シフト" },
  { id: "date", label: "デート/恋愛" },
  { id: "school", label: "授業/試験" },
  { id: "health", label: "通院/健康" },
  { id: "family", label: "家族/友人" },
  { id: "hobby", label: "趣味/イベント" },
  { id: "other", label: "その他" },
];

function normalizePriorityOrder(po: unknown): CalendarOpeningCategory[] {
  const allow = new Set(CATS.map((c) => c.id));
  const arr = Array.isArray(po) ? po : [];
  const filtered = arr.filter(
    (x): x is CalendarOpeningCategory =>
      typeof x === "string" && allow.has(x as CalendarOpeningCategory),
  );
  const uniq = Array.from(new Set([...filtered, ...CATS.map((c) => c.id)]));
  return uniq.slice(0, CATS.length);
}

function inferCategoryForEvent(ev: Ev, settings: CalendarOpeningSettings | null): CalendarOpeningCategory {
  const rules = settings?.rules ?? [];
  const priority = normalizePriorityOrder(settings?.priorityOrder);
  const hayTitle = (ev.title ?? "").toLowerCase();
  const hayLoc = (ev.location ?? "").toLowerCase();
  const hayDesc = (ev.description ?? "").toLowerCase();
  const scores = new Map<CalendarOpeningCategory, number>();
  const add = (cat: CalendarOpeningCategory, w: number) => {
    scores.set(cat, (scores.get(cat) ?? 0) + w);
  };
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
  firstDow: number;
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

  const effectivePriority = useMemo(() => normalizePriorityOrder(opening?.priorityOrder), [opening?.priorityOrder]);

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
      <UpcomingGoogleEvents filter={filterSettings} />

      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">表示・分類設定</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              カレンダー別/カテゴリ別に表示を絞り込めます。カテゴリは「分類ルール」で判定します。
            </p>
            {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
          </div>
          <Link href="/settings" className="shrink-0 text-[11px] text-zinc-500 underline dark:text-zinc-400">
            設定（全体）へ
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">カレンダーで絞り込む（複数可）</p>
            <div className="mt-2 flex flex-wrap gap-2">
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
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      on
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
                    ].join(" ")}
                    title={c.calendarId}
                  >
                    {c.calendarName}
                  </button>
                );
              })}
              {!opts?.calendars?.length ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">（候補がありません。予定を同期すると出ます）</p>
              ) : null}
            </div>
            {selectedCalendars.length ? (
              <button
                type="button"
                onClick={() => setSelectedCalendars([])}
                className="mt-2 text-[11px] text-zinc-500 underline dark:text-zinc-400"
              >
                カレンダーフィルタを解除
              </button>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">カテゴリで絞り込む（複数可）</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATS.map((c) => {
                const on = selectedCats.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCats((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                    }}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      on
                        ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-100"
                        : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {selectedCats.length ? (
              <button
                type="button"
                onClick={() => setSelectedCats([])}
                className="mt-2 text-[11px] text-zinc-500 underline dark:text-zinc-400"
              >
                カテゴリフィルタを解除
              </button>
            ) : null}
          </div>
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
                      {CATS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
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
                    priorityOrder: normalizePriorityOrder(effectivePriority),
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
                    cats={CATS}
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
                    priorityOrder: effectivePriority,
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

      <MonthGrid
        ym={props.ym}
        prevYm={props.prevYm}
        nextYm={props.nextYm}
        firstDow={props.firstDow}
        daysInMonth={props.daysInMonth}
        entries={props.entries}
        initialEvents={props.initialEvents}
        filter={filterSettings}
      />
    </>
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

