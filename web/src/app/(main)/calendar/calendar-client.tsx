"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  type CalendarViewMode,
  parseCalendarViewQuery,
  readCalendarViewFromStorage,
  writeCalendarViewToStorage,
} from "@/lib/calendar-view-persistence";
import { PlutchikDominantChip } from "@/components/plutchik-dominant-chip";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { WeatherAmPmDisplay } from "@/components/weather-am-pm-display";
import { SearchPanel } from "@/components/search-panel";
import { CALENDAR_GRID_COLOR_PRESETS, GCAL_COLOR_MAP, resolveGcalEventColor } from "@/lib/gcal-event-color";
import {
  type CalendarOpeningCategory,
  type CalendarOpeningSettings,
  type CalendarWeekStartDay,
  addCalendarOpeningBuiltinTextHints,
  BIRTHDAY_CALENDAR_NAME_SCORE_BOOST,
  CALENDAR_DEFAULT_CATEGORY_WEIGHT,
  calendarOpeningCategoryOptions,
  labelToUserCategoryId,
  lookupCalendarCategoryById,
  lookupCalendarDisplayLabelById,
  normalizeCalendarGridDisplay,
  normalizeCalendarOpeningPriorityOrder,
  PARTTIME_CALENDAR_NAME_SCORE_BOOST,
  pickWinningCalendarCategory,
  resolveCalendarDefaultCategoryForScoring,
  resolveCalendarDisplayNameForUser,
  SCHOOL_CALENDAR_NAME_SCORE_BOOST,
  stripCalendarOpeningCustomLabel,
  suggestsBirthdayCalendarName,
  suggestsParttimeCalendarName,
  suggestsSchoolCalendarName,
} from "@/lib/user-settings";
import {
  emitLocalSettingsSavedFromJson,
  extractServerSyncToken,
  LOCAL_SETTINGS_SAVED_EVENT,
  REMOTE_SETTINGS_UPDATED_EVENT,
} from "@/lib/settings-sync-client";
import { MonthList, invalidateMonthListEventsCache, peekMonthListEventsCache } from "./month-list";
import { MonthGrid, invalidateMonthGridEventsCache, peekMonthEventsCache } from "./month-grid";
import { UpcomingGoogleEvents } from "./upcoming-google-events";
import { CalendarEventEditDialog } from "./calendar-event-edit-dialog";

type EntryBrief = { entryDateYmd: string; title: string | null };
type Ev = {
  /** DB の google_calendar_event_cache.id（詳細は GET /api/calendar/cached-event/[cacheId]） */
  cacheId?: string;
  eventId?: string;
  title: string;
  start: string;
  end: string;
  location: string;
  calendarName?: string;
  colorId?: string;
  calendarId?: string;
  description?: string;
  fixedCategory?: string;
};

type CalendarAutoFixNotice = {
  variant: "warning" | "error";
  headline: string;
  body: string;
};
type DayPhotoItem = { id: string; thumbUrl: string; displayUrl: string; filename: string | null; productUrl: string | null };

type CalendarWriteDialog =
  | { kind: "closed" }
  | { kind: "edit"; ev: Ev }
  | { kind: "create" };

/** Individual-fix list window (matches server/calendar.ts sync range). */
const RECENT_INDIVIDUAL_FIX_PAST_DAYS = 90;
const RECENT_INDIVIDUAL_FIX_FUTURE_DAYS = 365;
const RECENT_INDIVIDUAL_FIX_MAX_EVENTS = 500;
/** If fewer events than this after the normal window, retry once with extended past + deep sync. */
const RECENT_INDIVIDUAL_FIX_MIN_BEFORE_DEEP = 3;
const RECENT_INDIVIDUAL_FIX_DEEP_PAST_DAYS = 730;

/** Auto classification: include events from this many days ago through RECENT_INDIVIDUAL_FIX_FUTURE_DAYS ahead. */
const AUTO_FIX_PAST_DAYS = 45;

function formatEventStartJa(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

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
  const fixed = (ev.fixedCategory ?? "").trim();
  if (fixed) return fixed as CalendarOpeningCategory;
  const rules = settings?.rules ?? [];
  const priority = normalizeCalendarOpeningPriorityOrder(settings);
  const hayTitle = (ev.title ?? "").toLowerCase();
  const hayLoc = (ev.location ?? "").toLowerCase();
  const hayDesc = (ev.description ?? "").toLowerCase();
  const haystack = `${ev.title ?? ""}\n${ev.location ?? ""}\n${ev.description ?? ""}\n${ev.calendarName ?? ""}`;
  const scores = new Map<CalendarOpeningCategory, number>();
  const add = (cat: CalendarOpeningCategory, w: number) => {
    scores.set(cat, (scores.get(cat) ?? 0) + w);
  };
  const calDefault = resolveCalendarDefaultCategoryForScoring(
    ev.calendarId,
    ev.calendarName,
    settings?.calendarCategoryById,
  );
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
  addCalendarOpeningBuiltinTextHints(haystack, add);
  if (suggestsParttimeCalendarName(ev.calendarName)) add("parttime", PARTTIME_CALENDAR_NAME_SCORE_BOOST);
  if (suggestsBirthdayCalendarName(ev.calendarName)) add("birthday", BIRTHDAY_CALENDAR_NAME_SCORE_BOOST);
  if (suggestsSchoolCalendarName(ev.calendarName)) add("school", SCHOOL_CALENDAR_NAME_SCORE_BOOST);
  add("other", 1);
  return pickWinningCalendarCategory(scores, priority);
}

function parseCalendarPageSettingsPayload(profile: Record<string, unknown> | null): {
  calendarOpening: CalendarOpeningSettings | null;
} {
  if (!profile) {
    return { calendarOpening: null };
  }
  const calendarOpening =
    profile.calendarOpening && typeof profile.calendarOpening === "object" && !Array.isArray(profile.calendarOpening)
      ? (profile.calendarOpening as CalendarOpeningSettings)
      : null;
  return { calendarOpening };
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
  /** URL-selected day (YYYY-MM-DD) for grid highlight + /calendar/... routing */
  selectedDateYmd?: string;
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
  const [info, setInfo] = useState<string | null>(null);
  const [calendarAutoFixNotice, setCalendarAutoFixNotice] = useState<CalendarAutoFixNotice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [customCatDraft, setCustomCatDraft] = useState("");
  const [activeCalendarId, setActiveCalendarId] = useState<string>("");
  const [recentFixEvents, setRecentFixEvents] = useState<Ev[] | null>(null);
  /** 直近の GET /api/settings の serverSyncToken（変化時だけフル再取得） */
  const lastServerSyncTokenRef = useRef<string | null>(null);
  /** 個別固定リスト取得の世代（古いレスポンスで上書きしない） */
  const recentFixLoadGenRef = useRef(0);
  /** Full settings fetch generation (ignore stale responses vs. chip edits). */
  const settingsLoadGenRef = useRef(0);

  const router = useRouter();
  const searchParams = useSearchParams();
  const dayModalOpen = searchParams.get("dayModal") === "1";
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("grid");
  const [dayPhotos, setDayPhotos] = useState<DayPhotoItem[]>([]);
  /** 日モーダル用（GET /api/entries?date= の画像・天気・主感情） */
  const [dayModalDominantEmotion, setDayModalDominantEmotion] = useState<string | null>(null);
  const [dayModalWeatherJson, setDayModalWeatherJson] = useState<unknown>(null);
  const [calendarWriteDialog, setCalendarWriteDialog] = useState<CalendarWriteDialog>({ kind: "closed" });
  const [localCalAddOpen, setLocalCalAddOpen] = useState(false);
  const [localCalNameDraft, setLocalCalNameDraft] = useState("");
  const [localCalAddBusy, setLocalCalAddBusy] = useState(false);
  const [localCalAddErr, setLocalCalAddErr] = useState<string | null>(null);
  const [canWriteGoogleCalendar, setCanWriteGoogleCalendar] = useState(false);

  useEffect(() => {
    const q = parseCalendarViewQuery(searchParams.get("view"));
    if (q) {
      setCalendarView(q);
      return;
    }
    const stored = readCalendarViewFromStorage();
    if (stored) setCalendarView(stored);
  }, [searchParams]);

  useEffect(() => {
    if (!dayModalOpen || !props.selectedDateYmd) {
      setDayPhotos([]);
      setDayModalDominantEmotion(null);
      setDayModalWeatherJson(null);
      return;
    }
    let alive = true;
    void fetch(`/api/entries?date=${encodeURIComponent(props.selectedDateYmd)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) {
          setDayPhotos([]);
          setDayModalDominantEmotion(null);
          setDayModalWeatherJson(null);
          return;
        }
        const entry = (j as {
          entry?: {
            id: string;
            dominantEmotion?: string | null;
            weatherJson?: unknown;
            images?: { id: string }[];
          } | null;
        }).entry;
        if (!entry?.id) {
          setDayPhotos([]);
          setDayModalDominantEmotion(null);
          setDayModalWeatherJson(null);
          return;
        }
        setDayModalDominantEmotion(typeof entry.dominantEmotion === "string" ? entry.dominantEmotion : null);
        setDayModalWeatherJson(entry.weatherJson ?? null);
        const imgs = entry.images;
        if (!Array.isArray(imgs) || !imgs.length) {
          setDayPhotos([]);
          return;
        }
        const items: DayPhotoItem[] = imgs.map((i) => ({
          id: i.id,
          thumbUrl: `/api/images/${i.id}`,
          displayUrl: `/api/images/${i.id}`,
          filename: null,
          productUrl: null,
        }));
        setDayPhotos(items);
      })
      .catch(() => {
        if (alive) {
          setDayPhotos([]);
          setDayModalDominantEmotion(null);
          setDayModalWeatherJson(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [dayModalOpen, props.selectedDateYmd]);

  const commitCalendarView = useCallback(
    (next: CalendarViewMode) => {
      setCalendarView(next);
      writeCalendarViewToStorage(next);
      const ymd = props.selectedDateYmd ?? `${props.ym}-01`;
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("view", next);
      sp.delete("dayModal");
      router.replace(`/calendar/${ymd}?${sp.toString()}`, { scroll: false });
    },
    [props.selectedDateYmd, props.ym, router, searchParams],
  );

  useEffect(() => {
    if (!settingsOpen) return;
    setInfo(null);
    setCalendarAutoFixNotice(null);
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

  const loadFullCalendarSettings = useCallback(async () => {
    const gen = ++settingsLoadGenRef.current;
    const res = await fetch(`/api/settings?_=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (gen !== settingsLoadGenRef.current) return;
    if (!res.ok) return;
    if (!json || typeof json !== "object" || Array.isArray(json)) return;
    const o = json as Record<string, unknown>;
    const tok = extractServerSyncToken(json);
    if (tok) lastServerSyncTokenRef.current = tok;
    const profile = o.profile && typeof o.profile === "object" && !Array.isArray(o.profile) ? (o.profile as Record<string, unknown>) : null;
    const { calendarOpening } = parseCalendarPageSettingsPayload(profile);
    if (gen !== settingsLoadGenRef.current) return;
    setOpening(calendarOpening);
  }, []);

  const maybeRefreshCalendarSettings = useCallback(
    async (hintToken?: string | null) => {
      if (typeof hintToken === "string" && hintToken.length > 0) {
        if (hintToken === lastServerSyncTokenRef.current) return;
        await loadFullCalendarSettings();
        return;
      }
      try {
        const res = await fetch(`/api/settings?syncCheck=1&_=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const j = (await res.json().catch(() => null)) as { serverSyncToken?: string } | null;
        const t = j?.serverSyncToken;
        if (typeof t !== "string" || t.length === 0) return;
        if (t === lastServerSyncTokenRef.current) return;
        await loadFullCalendarSettings();
      } catch {
        /* ignore */
      }
    },
    [loadFullCalendarSettings],
  );

  useEffect(() => {
    void loadFullCalendarSettings();
  }, [loadFullCalendarSettings]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/calendar/status", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive || !ok) return;
        setCanWriteGoogleCalendar(Boolean((j as { hasCalendarEventsWriteScope?: boolean }).hasCalendarEventsWriteScope));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onSync = (e: Event) => {
      const t = (e as CustomEvent<{ serverSyncToken?: string }>).detail?.serverSyncToken;
      void maybeRefreshCalendarSettings(typeof t === "string" && t.length > 0 ? t : undefined);
    };
    window.addEventListener(LOCAL_SETTINGS_SAVED_EVENT, onSync);
    window.addEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onSync);
    const onVis = () => {
      if (document.visibilityState === "visible") void maybeRefreshCalendarSettings();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(LOCAL_SETTINGS_SAVED_EVENT, onSync);
      window.removeEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onSync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [maybeRefreshCalendarSettings]);

  const reloadClassifierOptions = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void reloadClassifierOptions();
  }, [reloadClassifierOptions]);

  const catOptions = useMemo(() => calendarOpeningCategoryOptions(opening), [opening]);

  const gridDisplay = useMemo(() => normalizeCalendarGridDisplay(opening?.gridDisplay), [opening?.gridDisplay]);

  const calendarsForUi = useMemo(() => {
    const raw = opts?.calendars ?? [];
    const labels = opening?.calendarDisplayLabelById;
    return raw.map((c) => ({
      ...c,
      calendarName: resolveCalendarDisplayNameForUser(c.calendarId, c.calendarName, labels),
    }));
  }, [opts?.calendars, opening?.calendarDisplayLabelById]);

  const activeCalendar = useMemo(() => {
    const cals = calendarsForUi;
    return cals.find((c) => c.calendarId === activeCalendarId) ?? null;
  }, [calendarsForUi, activeCalendarId]);

  const noDisplayFilter = selectedCalendars.length === 0 && selectedCats.length === 0;

  async function autoFixCalendarCategory(calendarId: string) {
    if (!calendarId) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    setCalendarAutoFixNotice(null);
    const calNameRaw =
      (opts?.calendars ?? []).find((c) => c.calendarId === calendarId)?.calendarName?.trim() ?? "";
    const calDisplay =
      resolveCalendarDisplayNameForUser(calendarId, calNameRaw, opening?.calendarDisplayLabelById).trim() ||
      calNameRaw;
    const calTopic = calDisplay.length > 0 ? `カレンダー「${calDisplay}」` : "選択中のカレンダー";
    try {
      const now = new Date();
      const toD = new Date(now);
      toD.setDate(toD.getDate() + RECENT_INDIVIDUAL_FIX_FUTURE_DAYS);
      const to = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(toD)
        .replaceAll("/", "-");
      const fromD = new Date(now);
      fromD.setDate(fromD.getDate() - AUTO_FIX_PAST_DAYS);
      const from = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(fromD)
        .replaceAll("/", "-");

      const calQs = `calendarId=${encodeURIComponent(calendarId)}`;
      const res = await fetch(`/api/calendar/events?from=${from}&to=${to}&limit=2000&${calQs}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as { events?: Ev[]; error?: string; hint?: string };
      if (!res.ok) {
        const base = typeof json.error === "string" ? json.error : "予定の取得に失敗しました";
        const hint = typeof json.hint === "string" && json.hint.trim().length ? `\n${json.hint}` : "";
        setCalendarAutoFixNotice({
          variant: "error",
          headline: `${calTopic}の自動推定を開始できませんでした`,
          body: `${base}${hint}`,
        });
        return;
      }
      const all = Array.isArray(json.events) ? json.events : [];
      const target = all.filter((e) => (e.calendarId ?? "") === calendarId);

      // 予定が少ないと誤推定しやすいので、最低件数を要求
      if (target.length < 8) {
        const nameLine =
          calNameRaw.length > 0
            ? `題名「${calNameRaw}」のカレンダーについて、`
            : "カレンダー題名がまだ一覧に無い場合でも同じ手順で試せます。いま選択中のカレンダーについて、";
        setCalendarAutoFixNotice({
          variant: "warning",
          headline:
            calNameRaw.length > 0
              ? `「${calNameRaw}」の予定件数では、まだ自動推定を出しません`
              : "予定件数が少ないため、自動推定を出していません",
          body: `${nameLine}同期済みデータのうち対象期間（およそ${AUTO_FIX_PAST_DAYS}日前から最大${RECENT_INDIVIDUAL_FIX_FUTURE_DAYS}日先まで）に該当する予定が ${target.length} 件でした。偏った内容のまま一括で分類すると外しやすいので、目安として8件以上あるときだけ自動推定を表示しています。\n\n予定が増えたら「再試行」、Google 側との差分が気になるときは「強制同期して再試行」、すぐ決めたい場合は上のチップで分類を選び「このカレンダーの分類を保存」してください。`,
        });
        return;
      }

      const acRes = await fetch("/api/calendar/auto-classify-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          calendarId,
          calendarName: calNameRaw || undefined,
          events: target.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
            location: e.location,
            description: e.description,
            calendarId: e.calendarId,
            calendarName: e.calendarName?.trim() || calNameRaw || undefined,
            colorId: e.colorId,
          })),
          calendarOpening: opening
            ? {
                rules: opening.rules,
                priorityOrder: opening.priorityOrder,
                customCategoryLabels: opening.customCategoryLabels,
              }
            : undefined,
        }),
      });
      const acJson = (await acRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: unknown;
        category?: CalendarOpeningCategory;
        usedLlm?: boolean;
        ambiguousWithoutLlm?: boolean;
        ruleBased?: { winner: string; top: number; second: number; secondCat: string | null };
        eventCount?: number;
        avgDurationMinutes?: number | null;
      };
      if (!acRes.ok) {
        const base = typeof acJson.error === "string" ? acJson.error : "自動推定に失敗しました";
        const detail =
          process.env.NODE_ENV !== "production" && acJson.details != null
            ? `\n${JSON.stringify(acJson.details)}`
            : "";
        setCalendarAutoFixNotice({
          variant: "error",
          headline: `${calTopic}の自動推定を実行できませんでした`,
          body: `${base}${detail}`,
        });
        return;
      }
      if (!acJson.ok || !acJson.category) {
        setCalendarAutoFixNotice({
          variant: "error",
          headline: `${calTopic}を自動判定できませんでした`,
          body: "サーバーから有効な分類結果が返りませんでした。分類ルールを追加してから、もう一度お試しください。",
        });
        return;
      }

      const topCat = acJson.category;
      const topCatLabel = catOptions.find((c) => c.id === topCat)?.label ?? topCat;

      if (acJson.ambiguousWithoutLlm) {
        setCalendarAutoFixNotice({
          variant: "warning",
          headline: `${calTopic}の予定では、ルールベースだけでは決めきれません`,
          body:
            `スコア合算では先頭と次点が近く、誤った一括固定を避けるため自動保存していません。キーワードなどの分類ルールを足すか、上のチップで手動保存してください。サーバーに GEMINI_API_KEY（または GOOGLE_GENERATIVE_AI_API_KEY）または OPENAI_API_KEY を設定すると、あいまいなときだけ軽量モデルで補完できます（いまの最多候補: 「${topCatLabel}」）。`,
        });
        return;
      }

      if (topCat === "hobby" && suggestsParttimeCalendarName(calNameRaw)) {
        setCalendarAutoFixNotice({
          variant: "warning",
          headline: `${calTopic}では「趣味/イベント」をカレンダー既定に保存しません`,
          body: "カレンダー表示名が勤務・シフト向けに見えるため、自動推定で hobby を既定にすると外れやすいです。上のチップで「バイト/シフト」を選んで保存するか、分類ルールで calendarId 一致を追加してください。",
        });
        return;
      }

      if (topCat === "hobby" && suggestsSchoolCalendarName(calNameRaw)) {
        setCalendarAutoFixNotice({
          variant: "warning",
          headline: `${calTopic}では「趣味/イベント」をカレンダー既定に保存しません`,
          body: "カレンダー表示名が学業・課題提出向けに見えるため、自動推定で hobby を既定にすると外れやすいです。上のチップで「授業/試験」を選んで保存するか、分類ルールを追加してください。",
        });
        return;
      }

      const next: CalendarOpeningSettings = { ...(opening ?? {}) };
      const map = { ...(next.calendarCategoryById ?? {}) };
      map[calendarId] = topCat;
      next.calendarCategoryById = map;
      await saveCalendarOpening(next);
      const nEv = acJson.eventCount ?? target.length;
      const avgMin = acJson.avgDurationMinutes;
      const avgLine =
        avgMin != null && Number.isFinite(avgMin) ? `、平均所要約 ${Math.round(avgMin)}分` : "";
      const llmNote = acJson.usedLlm ? "（LLM 補完）" : "";
      setInfo(`固定しました: ${topCatLabel}${llmNote}（${nEv}件${avgLine}）`);
    } finally {
      setBusy(false);
    }
  }

  async function retryAutoFixWithForceSync(calendarId: string) {
    if (!calendarId) return;
    setBusy(true);
    setCalendarAutoFixNotice(null);
    setErr(null);
    setInfo(null);
    try {
      // まず同期だけ強制し、その後 autoFix を再実行
      const now = new Date();
      const to = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(now)
        .replaceAll("/", "-");
      const fromD = new Date(now);
      fromD.setDate(fromD.getDate() - 7);
      const from = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(fromD)
        .replaceAll("/", "-");
      await fetch(
        `/api/calendar/events?forceSync=1&from=${from}&to=${to}&limit=50&calendarId=${encodeURIComponent(calendarId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      ).catch(() => {});
    } finally {
      setBusy(false);
    }
    void autoFixCalendarCategory(calendarId);
  }

  async function setFixedCategoryForEvent(calendarId: string, eventId: string, category: CalendarOpeningCategory | null) {
    if (!calendarId || !eventId) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/calendar/fixed-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "by_event", calendarId, eventId, category }),
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; updated?: number };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : "イベント固定に失敗しました");
        return;
      }
      setRecentFixEvents((prev) =>
        (prev ?? []).map((e) => (e.eventId === eventId ? { ...e, fixedCategory: category ?? undefined } : e)),
      );
      setInfo("イベントを更新しました");
    } finally {
      setBusy(false);
    }
  }

  async function applyFixedCategoryByExactTitle(
    calendarId: string,
    title: string,
    category: CalendarOpeningCategory | null,
  ) {
    if (!calendarId) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/calendar/fixed-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "by_exact_title", calendarId, title, category }),
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; updated?: number };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : "タイトル一括の固定に失敗しました");
        return;
      }
      setRecentFixEvents((prev) =>
        (prev ?? []).map((e) =>
          (e.calendarId ?? "") === calendarId && e.title === title
            ? { ...e, fixedCategory: category ?? undefined }
            : e,
        ),
      );
      setInfo(`同じタイトルで更新しました（${j.updated ?? 0}件）`);
    } finally {
      setBusy(false);
    }
  }

  const loadRecentEventsForCalendar = useCallback(async (calendarId: string) => {
    if (!calendarId) return;
    const gen = ++recentFixLoadGenRef.current;
    try {
      const now = new Date();
      const toD = new Date(now);
      toD.setDate(toD.getDate() + RECENT_INDIVIDUAL_FIX_FUTURE_DAYS);
      const fmt = (d: Date) =>
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .format(d)
          .replaceAll("/", "-");
      const to = fmt(toD);

      const fetchList = async (fromD: Date, deep: boolean): Promise<Ev[]> => {
        const from = fmt(fromD);
        const deepQ = deep
          ? `&forceSync=1&deepSync=1&deepPastDays=${RECENT_INDIVIDUAL_FIX_DEEP_PAST_DAYS}`
          : "";
        const res = await fetch(
          `/api/calendar/events?from=${from}&to=${to}&limit=${RECENT_INDIVIDUAL_FIX_MAX_EVENTS}&calendarId=${encodeURIComponent(calendarId)}${deepQ}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const json = (await res.json().catch(() => ({}))) as { events?: Ev[] };
        const all = Array.isArray(json.events) ? json.events : [];
        return all
          .filter((e) => (e.calendarId ?? "") === calendarId)
          .slice()
          .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
          .slice(0, RECENT_INDIVIDUAL_FIX_MAX_EVENTS);
      };

      const fromNormal = new Date(now);
      fromNormal.setDate(fromNormal.getDate() - RECENT_INDIVIDUAL_FIX_PAST_DAYS);
      let list = await fetchList(fromNormal, false);
      if (list.length < RECENT_INDIVIDUAL_FIX_MIN_BEFORE_DEEP) {
        const fromDeep = new Date(now);
        fromDeep.setDate(fromDeep.getDate() - RECENT_INDIVIDUAL_FIX_DEEP_PAST_DAYS);
        list = await fetchList(fromDeep, true);
      }
      if (gen !== recentFixLoadGenRef.current) return;
      setRecentFixEvents(list);
    } catch {
      if (gen !== recentFixLoadGenRef.current) return;
      setRecentFixEvents([]);
    }
  }, []);

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
      const tok = extractServerSyncToken(json);
      if (tok) lastServerSyncTokenRef.current = tok;
      emitLocalSettingsSavedFromJson(json);
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

  const monthEventsForModal = useMemo(
    () => peekMonthEventsCache(props.ym) ?? peekMonthListEventsCache(props.ym) ?? props.initialEvents,
    [props.ym, props.initialEvents],
  );

  const modalDayEvents = useMemo(() => {
    if (!dayModalOpen || !props.selectedDateYmd) return [];
    const ymd = props.selectedDateYmd;
    const dedup = new Map<string, Ev>();
    for (const ev of monthEventsForModal) {
      if (!filterSettings.apply(ev)) continue;
      const d = tokyoYmdFromIsoLike(ev.start);
      if (d !== ymd) continue;
      const key = `${ev.start}|${ev.end}|${ev.title}|${ev.location}`;
      if (!dedup.has(key)) dedup.set(key, ev);
    }
    return [...dedup.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }, [dayModalOpen, props.selectedDateYmd, monthEventsForModal, filterSettings]);

  const modalEntryLine = useMemo(() => {
    if (!props.selectedDateYmd) return null;
    const row = props.entries.find((e) => e.entryDateYmd === props.selectedDateYmd);
    if (!row) return null;
    const t = (row.title ?? "").trim();
    return t.length > 0 ? t : null;
  }, [props.entries, props.selectedDateYmd]);

  const dayModalDiaryAside = useMemo(() => {
    type Wj = {
      kind?: string;
      am?: { time?: string; weatherLabel?: string; temperatureC?: number | null; weatherCode?: number | null };
      pm?: { time?: string; weatherLabel?: string; temperatureC?: number | null; weatherCode?: number | null };
      date?: string;
      dataSource?: "forecast" | "archive";
      locationNote?: string;
      weatherLabel?: string;
      temperature_2m?: number;
      period?: string;
    };
    const wj = dayModalWeatherJson as Wj | null;
    const hasEmotion = Boolean((dayModalDominantEmotion ?? "").trim());
    const hasAmPm = wj?.kind === "am_pm" && wj.am && wj.pm;
    const hasLegacyWx = typeof wj?.weatherLabel === "string" && wj.weatherLabel.trim().length > 0;
    return {
      show: dayPhotos.length > 0 || hasEmotion || hasAmPm || hasLegacyWx,
      wj,
      hasAmPm,
      hasLegacyWx,
      hasEmotion,
    };
  }, [dayModalWeatherJson, dayModalDominantEmotion, dayPhotos.length]);

  const closeDayModal = useCallback(() => {
    setCalendarWriteDialog({ kind: "closed" });
    const ymd = props.selectedDateYmd ?? `${props.ym}-01`;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("dayModal");
    const q = sp.toString();
    router.replace(q ? `/calendar/${ymd}?${q}` : `/calendar/${ymd}`, { scroll: false });
  }, [props.selectedDateYmd, props.ym, router, searchParams]);

  const onCalendarDayActivate = useCallback(
    (ymd: string, e: MouseEvent<HTMLAnchorElement>) => {
      const ne = e.nativeEvent;
      if (ne.metaKey || ne.ctrlKey || ne.shiftKey || ne.altKey) return;
      if ("button" in ne && ne.button !== 0) return;
      e.preventDefault();
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("view", calendarView);
      sp.set("dayModal", "1");
      router.replace(`/calendar/${ymd}?${sp.toString()}`, { scroll: false });
    },
    [calendarView, router, searchParams],
  );

  useEffect(() => {
    if (!settingsOpen) return;
    if (!activeCalendarId) {
      setRecentFixEvents(null);
      return;
    }
    setRecentFixEvents(null);
    void loadRecentEventsForCalendar(activeCalendarId);
  }, [settingsOpen, activeCalendarId, loadRecentEventsForCalendar]);

  const recentFixEventGroups = useMemo(() => {
    if (!recentFixEvents?.length || !activeCalendarId) return [];
    const scoped = recentFixEvents.filter((e) => (e.calendarId ?? "") === activeCalendarId);
    if (!scoped.length) return [];
    const map = new Map<string, Ev[]>();
    for (const e of scoped) {
      const key = e.title ?? "";
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    const out = [...map.entries()].map(([titleKey, events]) => {
      const sorted = events.slice().sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
      return {
        titleKey,
        displayTitle: titleKey.trim().length > 0 ? titleKey : "（無題）",
        events: sorted,
      };
    });
    out.sort((a, b) => Date.parse(b.events[0]!.start) - Date.parse(a.events[0]!.start));
    return out;
  }, [recentFixEvents, activeCalendarId]);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:max-w-2xl lg:max-w-5xl xl:max-w-6xl">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold leading-none text-zinc-900 dark:text-zinc-50">
            カレンダー
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium leading-none text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
              aria-controls="calendar-display-settings-dialog"
              aria-label="表示・分類設定を開く"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="block h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 011.262.125l.962.962a1 1 0 01.125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.416l.834 1.25a1 1 0 01-1.262.125l-.962-.962a6.95 6.95 0 01-1.416.587l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.95 6.95 0 01-1.416-.587l-1.25.834a1 1 0 01-1.262-.125l-.962-.962a1 1 0 01-.125-1.262l.834-1.25a6.95 6.95 0 01-.587-1.416l-1.473-.294A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 01.125-1.262l.962-.962A1 1 0 015.38 3.03l1.25.834a6.95 6.95 0 011.416-.587l.294-1.473zM13 10a3 3 0 11-6 0 3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden leading-none sm:inline">設定</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-expanded={searchOpen}
              aria-haspopup="dialog"
              aria-controls="calendar-search-dialog"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium leading-none text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            >
              検索
            </button>
          </div>
        </div>
      </header>

      <div className="mt-2 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-4 lg:min-h-0">
          <UpcomingGoogleEvents
            key="upcoming-google-events"
            filter={filterSettings}
            calendarHexById={gridDisplay.calendarHexById}
            calendarDisplayLabelById={opening?.calendarDisplayLabelById}
          />
          {props.selectedDateYmd ? (
            <p className="text-center text-sm text-zinc-600 sm:text-left dark:text-zinc-400">
              <Link
                href={`/entries/${props.selectedDateYmd}`}
                className="font-medium text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {props.selectedDateYmd} のエントリ（本文・画像・追記）を開く
              </Link>
            </p>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 lg:min-w-0">
          <div className="space-y-1.5">
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
            {calendarsForUi.map((c) => {
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
          ※ 表示のみ。Google の予定データは変わりません。月グリッド／リスト・週の始まりなどは右上の「設定」から変更できます。
        </p>
          </div>

          {calendarView === "grid" ? (
            <MonthGrid
              key={`mg-${props.ym}`}
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
              selectedDateYmd={props.selectedDateYmd}
              filter={filterSettings}
              onDayActivate={onCalendarDayActivate}
            />
          ) : (
            <MonthList
              key={`ml-${props.ym}`}
              ym={props.ym}
              prevYm={props.prevYm}
              nextYm={props.nextYm}
              daysInMonth={props.daysInMonth}
              entries={props.entries}
              initialEvents={props.initialEvents}
              calendarHexById={gridDisplay.calendarHexById}
              selectedDateYmd={props.selectedDateYmd}
              filter={filterSettings}
              onDayActivate={onCalendarDayActivate}
            />
          )}
        </div>
      </div>

      {settingsOpen ? (
        <ResponsiveDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          labelledBy="calendar-display-settings-title"
          dialogId="calendar-display-settings-dialog"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800 dark:bg-zinc-950 md:pt-4">
              <div className="min-w-0 pr-2">
                <h2 id="calendar-display-settings-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  表示・分類設定
                </h2>
                <p className="mt-1 max-md:text-[11px] text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  表示・色・分類をここで設定。
                </p>
                {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
                {info ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{info}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[15px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  閉じる
                </button>
                <Link href="/settings" className="text-sm text-zinc-500 underline dark:text-zinc-400">
                  設定（全体）へ
                </Link>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">月カレンダーの見た目</h3>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2" role="group" aria-label="月カレンダー表示の基本設定">
            <div className="rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <label
                htmlFor="calendar-view-mode-select"
                className="block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300"
              >
                表示方式
              </label>
              <select
                id="calendar-view-mode-select"
                disabled={busy}
                value={calendarView}
                onChange={(e) => commitCalendarView(e.target.value as CalendarViewMode)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-[13px] font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="grid">月グリッド</option>
                <option value="list">リスト</option>
              </select>
            </div>

            <div className="rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <label className="block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">週の始まり</label>
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
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-[13px] font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {CALENDAR_WEEK_START_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
              <label className="block text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">
                1マスに並べる予定（最大）
              </label>
              <p className="mt-0.5 text-[12px] leading-snug text-zinc-400 dark:text-zinc-500">月グリッド表示のとき</p>
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
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-[13px] font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}件
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-center rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/40">
              <p className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">表示のヒント</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                <li>「+N件」＝左下最大件数。リストでも週始まり反映。</li>
                <li>色・分類は「対象カレンダー」→下で保存。</li>
              </ul>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">カレンダーごとの色・分類</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              プルダウンで1つずつ選び、ドット色と分類のデフォルトを設定します。
            </p>
            {!opts?.calendars?.length ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                （Google のカレンダーは予定同期後に出ます。アプリ内カレンダーは右の「＋」から追加できます）
              </p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                  <span className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">対象カレンダー</span>
                  <button
                    type="button"
                    disabled={busy || localCalAddBusy}
                    onClick={() => {
                      setLocalCalAddErr(null);
                      setLocalCalAddOpen((v) => !v);
                      if (localCalAddOpen) setLocalCalNameDraft("");
                    }}
                    className="shrink-0 rounded-lg border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-200/90 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    title="このアプリにだけ保存するカレンダーを追加（Google には同期しません）"
                  >
                    {localCalAddOpen ? "閉じる" : "＋ アプリ内"}
                  </button>
                </div>
                {localCalAddOpen ? (
                  <div className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/90 p-2.5 dark:border-zinc-600 dark:bg-zinc-900/50">
                    <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                      Google 連携なしで予定を置けます。予定の追加は日付モーダルから行えます。
                    </p>
                    {localCalAddErr ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{localCalAddErr}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={localCalNameDraft}
                        onChange={(e) => setLocalCalNameDraft(e.target.value)}
                        maxLength={80}
                        placeholder="例: 私用メモ"
                        disabled={localCalAddBusy}
                        className="min-w-[10rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
                      />
                      <button
                        type="button"
                        disabled={localCalAddBusy || !localCalNameDraft.trim()}
                        onClick={() => {
                          void (async () => {
                            setLocalCalAddBusy(true);
                            setLocalCalAddErr(null);
                            try {
                              const res = await fetch("/api/calendar/local-calendars", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                credentials: "same-origin",
                                body: JSON.stringify({ name: localCalNameDraft }),
                              });
                              const j = (await res.json().catch(() => ({}))) as {
                                error?: string;
                                calendar?: { calendarId: string; calendarName: string };
                              };
                              if (!res.ok) {
                                setLocalCalAddErr(typeof j.error === "string" ? j.error : "追加に失敗しました");
                                return;
                              }
                              const cid = j.calendar?.calendarId;
                              setLocalCalNameDraft("");
                              setLocalCalAddOpen(false);
                              await reloadClassifierOptions();
                              if (cid) setActiveCalendarId(cid);
                            } finally {
                              setLocalCalAddBusy(false);
                            }
                          })();
                        }}
                        className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        {localCalAddBusy ? "追加中…" : "追加"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <label className="mt-2 block text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
                  <span className="sr-only">対象カレンダー</span>
                  <select
                    disabled={busy}
                    value={activeCalendarId}
                    onChange={(e) => setActiveCalendarId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-[13px] font-medium text-zinc-900 shadow-sm outline-none ring-zinc-400 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
                  >
                    {calendarsForUi.map((cal) => {
                      const catId = lookupCalendarCategoryById(opening?.calendarCategoryById, cal.calendarId);
                      const catLabel =
                        catId != null ? (catOptions.find((c) => c.id === catId)?.label ?? String(catId)) : null;
                      const hasColor = Boolean(gridDisplay.calendarHexById[cal.calendarId]);
                      const chunks: string[] = [];
                      if (catLabel) chunks.push(`(${catLabel})`);
                      if (hasColor) chunks.push("色");
                      const suffix = chunks.length ? ` ${chunks.join(" · ")}` : "";
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
                      const apiCal = (opts?.calendars ?? []).find((c) => c.calendarId === cal.calendarId);
                      const apiCalendarName = apiCal?.calendarName ?? cal.calendarName;
                      const customLabel = lookupCalendarDisplayLabelById(
                        opening?.calendarDisplayLabelById,
                        cal.calendarId,
                      );
                      const defHex = (GCAL_COLOR_MAP[cal.calendarColorId] ?? "#10b981").toLowerCase();
                      const override = gridDisplay.calendarHexById[cal.calendarId];
                      const shownRaw = (override ?? defHex).toLowerCase();
                      const shown = /^#[0-9a-f]{6}$/i.test(shownRaw) ? shownRaw : defHex;
                      return (
                        <CalendarDotColorPicker
                          detailTitle={cal.calendarId}
                          calendarName={cal.calendarName}
                          apiCalendarName={apiCalendarName}
                          customDisplayLabel={customLabel}
                          shownHex={shown}
                          busy={busy}
                          hasOverride={Boolean(override)}
                          onCommitDisplayLabel={(next) => {
                            const calId = cal.calendarId;
                            const map = { ...(opening?.calendarDisplayLabelById ?? {}) };
                            if (next == null || next.trim() === "") delete map[calId];
                            else map[calId] = next.normalize("NFKC").trim().slice(0, 80);
                            const nextOpening: CalendarOpeningSettings = { ...(opening ?? {}) };
                            if (Object.keys(map).length === 0) delete nextOpening.calendarDisplayLabelById;
                            else nextOpening.calendarDisplayLabelById = map;
                            void saveCalendarOpening(nextOpening);
                          }}
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
                    <div className="relative z-10 rounded-xl border border-zinc-200/90 bg-gradient-to-b from-white to-violet-50/40 p-3 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-violet-950/20">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200" id="calendar-assign-category-label">
                        このカレンダーの予定の分類
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                        「自動」は分類ルールを主に、プロフィールでスコアを少し寄せます。色付きチップは保存した
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">カレンダー既定の分類</span>
                        （チャットAIの即時判定ではありません）。加算は
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">分類ルールの「カレンダー」一致</span>
                        より弱いです。
                      </p>
                      <div
                        className="mt-2 flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-labelledby="calendar-assign-category-label"
                      >
                        {(() => {
                          const calId = activeCalendar.calendarId;
                          const assigned = lookupCalendarCategoryById(opening?.calendarCategoryById, calId);
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
                                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                                  autoOn
                                    ? "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
                                ].join(" ")}
                              >
                                固定しない（自動判定）
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
                                      className={["rounded-full border px-2.5 py-0.5 text-xs font-medium", on ? selectedCls : idleCls].join(
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
                              <span className="inline-flex w-full max-w-full items-center gap-1.5 sm:w-auto sm:max-w-none">
                                <input
                                  value={customCatDraft}
                                  onChange={(e) => setCustomCatDraft(e.target.value)}
                                  maxLength={24}
                                  disabled={busy}
                                  placeholder="例: 旅行"
                                  aria-label="カスタムカテゴリ名"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void addCustomCategory();
                                    }
                                  }}
                                  className="calendar-dialog-compact-chip-text min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-900 outline-none ring-zinc-400 placeholder:font-normal placeholder:text-zinc-400 focus-visible:ring-2 disabled:opacity-50 sm:max-w-[13rem] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-500"
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void addCustomCategory()}
                                  className="shrink-0 rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 hover:bg-zinc-200/90 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                                >
                                  追加
                                </button>
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      {activeCalendar &&
                      lookupCalendarCategoryById(opening?.calendarCategoryById, activeCalendar.calendarId) === "hobby" &&
                      suggestsParttimeCalendarName(
                        (opts?.calendars ?? []).find((c) => c.calendarId === activeCalendar.calendarId)
                          ?.calendarName ?? activeCalendar.calendarName,
                      ) ? (
                        <div
                          role="status"
                          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100"
                        >
                          <p>
                            カレンダー名が勤務・シフト向けなのに「趣味/イベント」が保存されています。一覧の色分け・絞り込みを揃えるには「バイト/シフト」へ直してください。
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void saveCalendarOpening({
                                ...(opening ?? {}),
                                calendarCategoryById: {
                                  ...(opening?.calendarCategoryById ?? {}),
                                  [activeCalendar.calendarId]: "parttime",
                                },
                              })
                            }
                            className="mt-2 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-sm font-medium text-amber-950 hover:bg-amber-100/80 disabled:opacity-50 dark:border-amber-800/60 dark:bg-zinc-950 dark:text-amber-100 dark:hover:bg-amber-950/40"
                          >
                            バイト/シフトに直して保存
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-2">
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
                          このカレンダーの分類を保存
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        1つだけ選べます。「固定しない」はキーワード・ルール優先で毎回推定します。細かいルールは「設定（全体）」の開口トピック（日記チャット）から追加できます。
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void autoFixCalendarCategory(activeCalendar.calendarId)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                        >
                          自動推定で固定する（このカレンダー）
                        </button>
                      </div>
                      {calendarAutoFixNotice ? (
                        <div
                          role="status"
                          aria-live="polite"
                          className={
                            calendarAutoFixNotice.variant === "warning"
                              ? "mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/45 dark:bg-amber-950/25"
                              : "mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/20"
                          }
                        >
                          <p
                            className={
                              calendarAutoFixNotice.variant === "warning"
                                ? "text-sm font-semibold text-amber-950 dark:text-amber-100"
                                : "text-sm font-semibold text-red-800 dark:text-red-200"
                            }
                          >
                            {calendarAutoFixNotice.headline}
                          </p>
                          <p
                            className={
                              calendarAutoFixNotice.variant === "warning"
                                ? "whitespace-pre-wrap text-sm leading-snug text-amber-900 dark:text-amber-200"
                                : "whitespace-pre-wrap text-sm leading-snug text-red-700 dark:text-red-300"
                            }
                          >
                            {calendarAutoFixNotice.body}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void autoFixCalendarCategory(activeCalendar.calendarId)}
                              className={
                                calendarAutoFixNotice.variant === "warning"
                                  ? "rounded-md border border-amber-300 bg-white px-2 py-1 text-sm font-medium text-amber-950 hover:bg-amber-100/90 disabled:opacity-50 dark:border-amber-800/60 dark:bg-zinc-950 dark:text-amber-100 dark:hover:bg-amber-950/35"
                                  : "rounded-md border border-red-200 bg-white px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/30"
                              }
                            >
                              再試行
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void retryAutoFixWithForceSync(activeCalendar.calendarId)}
                              className="rounded-md border border-amber-300 bg-amber-100/80 px-2 py-1 text-sm font-medium text-amber-950 hover:bg-amber-200/80 disabled:opacity-50 dark:border-amber-800/55 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/55"
                            >
                              強制同期して再試行
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <details className="mt-3 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <summary className="cursor-pointer select-none text-sm font-medium text-zinc-700 dark:text-zinc-200">
                          イベント単位の固定（個別）
                        </summary>
                        <p className="mt-1 text-[13px] leading-snug text-zinc-500 dark:text-zinc-400">
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">
                            対象: {activeCalendar.calendarName}
                          </span>
                          。まず約過去{RECENT_INDIVIDUAL_FIX_PAST_DAYS}日〜未来{RECENT_INDIVIDUAL_FIX_FUTURE_DAYS}
                          日・最大{RECENT_INDIVIDUAL_FIX_MAX_EVENTS}
                          件を読み、件数が{RECENT_INDIVIDUAL_FIX_MIN_BEFORE_DEEP}
                          件未満のときだけ過去約{RECENT_INDIVIDUAL_FIX_DEEP_PAST_DAYS}
                          日まで広げて Google を再同期してから再取得します。上のプルダウンで選んだカレンダーと常に一致します。タイトル行の右「同タイトル一括」でそのタイトル分をまとめて固定できます（1件だけでも表示されます）。個別の「固定しない」は DB の上書きを外し、カレンダー既定・ルールによる推定に従います。
                        </p>
                        {!recentFixEvents ? (
                          <p className="mt-2 text-sm text-zinc-500">読み込み中…</p>
                        ) : recentFixEventGroups.length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-500">
                            （「{activeCalendar.calendarName}」の予定が見つかりません）
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-3">
                            {recentFixEventGroups.map((g) => {
                              const calId = activeCalendar.calendarId;
                              const missingId = g.events.some((e) => !(e.eventId ?? "").trim());
                              const groupSuggested = inferCategoryForEvent(g.events[0]!, opening);
                              return (
                                <li key={g.titleKey.length ? g.titleKey : "__untitled__"} className="list-none">
                                  <details className="group rounded-lg border border-zinc-100 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40">
                                    <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg px-2 py-2 text-left [&::-webkit-details-marker]:hidden">
                                      <div className="min-w-0 flex-1">
                                        <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                                          {g.displayTitle}
                                        </span>
                                        <span className="mt-0.5 block text-[13px] text-zinc-500 dark:text-zinc-400">
                                          {g.events.length}件
                                          {missingId ? " · 一部 eventId なし" : ""}
                                          <span className="sr-only">
                                            （開いて個別の固定を表示。同タイトル一括は右のプルダウン）
                                          </span>
                                        </span>
                                      </div>
                                      <label
                                        className="mt-0.5 w-[11rem] shrink-0 text-[13px] font-medium text-zinc-500 dark:text-zinc-400"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        同タイトル一括
                                        <select
                                          key={`bulk-${calId}-${lookupCalendarCategoryById(opening?.calendarCategoryById, calId) ?? "_"}-${g.titleKey}`}
                                          disabled={busy || missingId}
                                          defaultValue={groupSuggested}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) return;
                                            const cat = v === "__clear__" ? null : (v as CalendarOpeningCategory);
                                            void applyFixedCategoryByExactTitle(calId, g.titleKey, cat);
                                            e.currentTarget.value = "";
                                          }}
                                          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-1.5 py-0.5 text-[13px] font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                        >
                                          <option value="">選ぶ…</option>
                                          <option value="__clear__">固定しない（DBの固定を外す）</option>
                                          {catOptions.map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <span
                                        className="mt-0.5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180 dark:text-zinc-500"
                                        aria-hidden
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          viewBox="0 0 20 20"
                                          fill="currentColor"
                                          className="h-4 w-4"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                      </span>
                                    </summary>
                                    <div className="space-y-2 border-t border-zinc-200/80 px-2 pb-2 pt-2 dark:border-zinc-800">
                                      <div className="max-h-[13rem] overflow-y-auto overscroll-contain pr-0.5">
                                      <ul className="space-y-2">
                                    {g.events.map((ev, idx) => {
                                      const eventId = ev.eventId ?? "";
                                      const stored = (ev.fixedCategory ?? "").trim();
                                      const inferred = inferCategoryForEvent(ev, opening);
                                      const selectValue = stored || inferred;
                                      return (
                                        <li
                                          key={`${eventId || ev.start}-${idx}`}
                                          className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-white/80 px-2 py-1.5 dark:bg-zinc-950/50"
                                        >
                                          <p className="min-w-0 flex-1 text-[13px] text-zinc-600 dark:text-zinc-300">
                                            {formatEventStartJa(ev.start)}
                                          </p>
                                          <label className="shrink-0 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
                                            個別
                                            <select
                                              disabled={busy || !eventId}
                                              value={selectValue}
                                              onChange={(e) => {
                                                const v = e.target.value;
                                                if (v === "__clear__") {
                                                  void setFixedCategoryForEvent(calId, eventId, null);
                                                  return;
                                                }
                                                void setFixedCategoryForEvent(
                                                  calId,
                                                  eventId,
                                                  v as CalendarOpeningCategory,
                                                );
                                              }}
                                              className="mt-1 w-full min-w-[9.5rem] rounded-lg border border-zinc-200 bg-white px-1.5 py-0.5 text-[13px] font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                            >
                                              <option value="__clear__">固定しない（DBの固定を外す）</option>
                                              {catOptions.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                  {c.label}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        </li>
                                      );
                                    })}
                                      </ul>
                                      </div>
                                      {missingId ? (
                                        <p className="text-[13px] text-amber-700 dark:text-amber-300">
                                          eventId が取得できない予定があるため、一括固定は使えません（個別のみ可能な行があります）。
                                        </p>
                                      ) : null}
                                    </div>
                                  </details>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </details>
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
          </div>
          </div>
        </ResponsiveDialog>
      ) : null}

      {dayModalOpen && props.selectedDateYmd ? (
        <ResponsiveDialog
          open
          onClose={closeDayModal}
          labelledBy="calendar-day-modal-title"
          dialogId="calendar-day-modal-dialog"
          zClass="z-[55]"
          presentation="sheetBottom"
        >
          <div className="flex min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="min-w-0">
                <h2
                  id="calendar-day-modal-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {props.selectedDateYmd}
                </h2>
                {modalEntryLine ? (
                  <p className="mt-1 truncate text-xs text-blue-700 dark:text-blue-300">日記: {modalEntryLine}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarWriteDialog({ kind: "create" })}
                  disabled={!calendarsForUi.length}
                  title={!calendarsForUi.length ? "カレンダー一覧の取得後に利用できます" : undefined}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 shadow-sm hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
                >
                  予定を追加
                </button>
                <button
                  type="button"
                  onClick={closeDayModal}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  閉じる
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {modalDayEvents.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">この日の予定はありません（絞り込み後）。</p>
              ) : (
                <ul className="space-y-3">
                  {modalDayEvents.map((ev, idx) => {
                    const canEditThis = Boolean((ev.calendarId ?? "").trim() && (ev.eventId ?? "").trim());
                    return (
                      <li
                        key={`${ev.eventId ?? ev.start}-${idx}`}
                        className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: resolveGcalEventColor(ev, gridDisplay.calendarHexById) }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                {ev.title.trim() || "（無題）"}
                              </p>
                              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                                {formatEventStartJa(ev.start)}
                                {ev.calendarName ? ` · ${ev.calendarName}` : ""}
                              </p>
                              {(ev.location ?? "").trim() ? (
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{ev.location}</p>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCalendarWriteDialog({ kind: "edit", ev })}
                            disabled={!canEditThis}
                            title={
                              canEditThis
                                ? "Google カレンダー上のこの予定を編集"
                                : "この予定は識別子がないため編集できません（同期後に再試行）"
                            }
                            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            編集
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {dayModalDiaryAside.show ? (
                <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">この日の日記（写真・天気・感情）</h3>
                  <div
                    className={
                      dayPhotos.length > 0 &&
                      (dayModalDiaryAside.hasEmotion ||
                        dayModalDiaryAside.hasAmPm ||
                        dayModalDiaryAside.hasLegacyWx)
                        ? "mt-3 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5"
                        : "mt-3 flex min-w-0 flex-col gap-4"
                    }
                  >
                    {dayPhotos.length > 0 ? (
                      <div className="min-w-0 flex-1 lg:min-h-0">
                        <div
                          className="flex gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] snap-x snap-mandatory lg:mt-0"
                          role="list"
                          aria-label="この日の画像（横にスライド）"
                        >
                          {dayPhotos.map((p) => (
                            <a
                              key={p.id}
                              href={p.productUrl || p.displayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              role="listitem"
                              className="snap-center shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700 [width:min(9.5rem,calc((100vw-3rem)/3*0.8))] [height:min(9.5rem,calc((100vw-3rem)/3*0.8))] sm:[width:min(10.25rem,26vw)] sm:[height:min(10.25rem,26vw)]"
                              title={p.filename ?? undefined}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.thumbUrl}
                                alt={p.filename ?? "エントリ画像"}
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {dayModalDiaryAside.hasEmotion || dayModalDiaryAside.hasAmPm || dayModalDiaryAside.hasLegacyWx ? (
                      <div
                        className={[
                          "min-w-0 shrink-0 space-y-3 lg:w-[min(100%,22rem)]",
                          dayPhotos.length > 0
                            ? "border-t border-zinc-200/80 pt-4 dark:border-zinc-700/80 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"
                            : "",
                        ].join(" ")}
                      >
                        {dayModalDiaryAside.hasEmotion ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <PlutchikDominantChip dominantKey={dayModalDominantEmotion} />
                          </div>
                        ) : null}
                        {dayModalDiaryAside.hasAmPm && dayModalDiaryAside.wj?.am && dayModalDiaryAside.wj.pm ? (
                          <WeatherAmPmDisplay
                            am={dayModalDiaryAside.wj.am}
                            pm={dayModalDiaryAside.wj.pm}
                            date={dayModalDiaryAside.wj.date}
                            dataSource={dayModalDiaryAside.wj.dataSource}
                            locationNote={dayModalDiaryAside.wj.locationNote}
                            compact
                          />
                        ) : dayModalDiaryAside.hasLegacyWx && dayModalDiaryAside.wj ? (
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            記録された天気: {dayModalDiaryAside.wj.weatherLabel}
                            {dayModalDiaryAside.wj.temperature_2m != null
                              ? ` / ${dayModalDiaryAside.wj.temperature_2m}°C`
                              : ""}
                            {dayModalDiaryAside.wj.period ? `（${dayModalDiaryAside.wj.period}）` : ""}
                            {dayModalDiaryAside.wj.locationNote ? ` · ${dayModalDiaryAside.wj.locationNote}` : ""}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
              <div className="mt-6 flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <Link
                  href={`/entries/${props.selectedDateYmd}`}
                  onClick={closeDayModal}
                  className="text-center text-sm font-medium text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 sm:text-left"
                >
                  この日のエントリ（本文・画像）を開く
                </Link>
                <Link
                  href={`/calendar/${props.selectedDateYmd}`}
                  onClick={closeDayModal}
                  className="text-center text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 sm:text-left"
                >
                  モーダルを閉じてこの日付のページだけ表示
                </Link>
              </div>
            </div>
          </div>
        </ResponsiveDialog>
      ) : null}

      <CalendarEventEditDialog
        mode={calendarWriteDialog.kind === "create" ? "create" : "edit"}
        open={calendarWriteDialog.kind !== "closed"}
        event={
          calendarWriteDialog.kind === "edit" &&
          (calendarWriteDialog.ev.eventId ?? "").trim() &&
          (calendarWriteDialog.ev.calendarId ?? "").trim()
            ? {
                eventId: calendarWriteDialog.ev.eventId!.trim(),
                calendarId: calendarWriteDialog.ev.calendarId!.trim(),
                title: calendarWriteDialog.ev.title,
                start: calendarWriteDialog.ev.start,
                end: calendarWriteDialog.ev.end,
                location: calendarWriteDialog.ev.location,
                description: calendarWriteDialog.ev.description,
              }
            : null
        }
        createContext={
          calendarWriteDialog.kind === "create" && props.selectedDateYmd
            ? {
                dateYmd: props.selectedDateYmd,
                calendars: calendarsForUi.map((c) => ({
                  calendarId: c.calendarId,
                  calendarName: c.calendarName,
                })),
                suggestedCalendarId: (modalDayEvents[0]?.calendarId ?? "").trim() || undefined,
              }
            : undefined
        }
        canWriteGoogle={canWriteGoogleCalendar}
        onClose={() => setCalendarWriteDialog({ kind: "closed" })}
        onSaved={() => {
          invalidateMonthGridEventsCache();
          invalidateMonthListEventsCache();
          router.refresh();
        }}
      />

      {searchOpen ? (
        <ResponsiveDialog
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          labelledBy="calendar-search-title"
          dialogId="calendar-search-dialog"
          zClass="z-[60]"
        >
          <div className="flex min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 id="calendar-search-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                日記を検索
              </h2>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {"\u9589\u3058\u308b"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Suspense fallback={<div className="p-4 text-center text-sm text-zinc-500">読み込み中…</div>}>
                <SearchPanel className="px-4 py-4" onNavigateHit={() => setSearchOpen(false)} />
              </Suspense>
            </div>
          </div>
        </ResponsiveDialog>
      ) : null}
    </>
  );
}

const PRESET_HEX_SET = new Set(CALENDAR_GRID_COLOR_PRESETS.map((h) => h.toLowerCase()));

function CalendarDotColorPicker({
  detailTitle,
  calendarName,
  apiCalendarName,
  customDisplayLabel,
  shownHex,
  busy,
  hasOverride,
  onCommitDisplayLabel,
  onSelectHex,
  onClearOverride,
}: {
  detailTitle: string;
  calendarName: string;
  apiCalendarName: string;
  customDisplayLabel: string | undefined;
  shownHex: string;
  busy: boolean;
  hasOverride: boolean;
  onCommitDisplayLabel: (next: string | null) => void;
  onSelectHex: (hex: string) => void;
  onClearOverride: () => void;
}) {
  const [draftLabel, setDraftLabel] = useState(() => customDisplayLabel ?? "");
  useEffect(() => {
    setDraftLabel(customDisplayLabel ?? "");
  }, [detailTitle, customDisplayLabel]);

  function flushDisplayLabel() {
    const normalized = draftLabel.normalize("NFKC").trim().slice(0, 80);
    const stored = (customDisplayLabel ?? "").trim();
    if (normalized === stored) return;
    if (!normalized && !stored) return;
    if (!normalized) onCommitDisplayLabel(null);
    else onCommitDisplayLabel(normalized);
  }

  const safe = shownHex.toLowerCase();
  const isCustom = !PRESET_HEX_SET.has(safe);

  const swatchRing =
    "ring-2 ring-zinc-900 ring-offset-2 ring-offset-zinc-50 dark:ring-zinc-100 dark:ring-offset-zinc-950";

  return (
    <div className="relative z-0 rounded-xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 p-2.5 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-950/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100" title={detailTitle}>
            {calendarName}
          </p>
          {apiCalendarName !== calendarName ? (
            <p className="mt-0.5 truncate text-[13px] text-zinc-400 dark:text-zinc-500" title={apiCalendarName}>
              同期名: {apiCalendarName}
            </p>
          ) : null}
        </div>
        {hasOverride ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClearOverride}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            デフォルト
          </button>
        ) : null}
      </div>
      <label className="mt-2 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        表示名（このアプリのみ・80文字以内）
        <input
          type="text"
          disabled={busy}
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onBlur={() => flushDisplayLabel()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={apiCalendarName}
          maxLength={80}
          className="calendar-dialog-compact-text mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-900 outline-none ring-zinc-400 placeholder:text-zinc-400 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-500"
        />
      </label>
      <p className="mt-1 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
        Googleカレンダー上の名前は変わりません。空にしてフォーカスを外すと同期名に戻します。
      </p>
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
                "h-8 w-8 shrink-0 rounded-full border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,box-shadow] hover:brightness-95 active:brightness-90 disabled:pointer-events-none disabled:opacity-50 dark:border-white/15 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:brightness-110",
                selected ? swatchRing : "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950",
              ].join(" ")}
            />
          );
        })}
        <label
          className={[
            "relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-dashed transition-[filter,box-shadow] hover:brightness-95",
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
              className="pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-[13px] font-bold text-zinc-700 shadow-sm dark:bg-zinc-900/90 dark:text-zinc-200"
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

