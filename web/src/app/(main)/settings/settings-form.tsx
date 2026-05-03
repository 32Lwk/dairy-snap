"use client";

import { CalendarOpeningPriorityEditor } from "@/components/calendar-opening-priority-editor";
import { PlaceCoordsLine } from "@/components/place-coords-line";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { SettingsAccountActions } from "@/components/settings-account-actions";
import { SettingsActionIconButton } from "@/components/settings-action-icon-button";
import { SettingsMemoryPanel } from "@/components/settings-memory-panel";
import { FancySelect } from "@/components/fancy-select";
import { UserProfileForm, type UserProfilePayload } from "@/components/user-profile-form";
import type {
  CalendarOpeningCategory,
  CalendarOpeningRule,
  CalendarOpeningSettings,
} from "@/lib/user-settings";
import {
  CALENDAR_OPENING_BUILTIN_CATS,
  RECOMMENDED_CALENDAR_OPENING_CATEGORY_IMPACT_MULTIPLIERS,
  calendarOpeningCategoryOptions,
  hydrateProfilePayloadForForms,
  mergeRecommendedCalendarOpeningImpactMultipliers,
  normalizeCalendarOpeningPriorityOrder,
} from "@/lib/user-settings";
import {
  emitLocalSettingsSavedFromJson,
  REMOTE_SETTINGS_UPDATED_EVENT,
} from "@/lib/settings-sync-client";
import { reverseGeocodeClient } from "@/lib/reverse-geocode-client";
import { resolveDayBoundaryEndTime } from "@/lib/time/user-day-boundary";
import { OnboardingChatFlow } from "@/app/(main)/onboarding/onboarding-chat-flow";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useState } from "react";

const WeatherLocationMapPicker = dynamic(
  () =>
    import("@/components/weather-location-map-picker").then((m) => ({
      default: m.WeatherLocationMapPicker,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 md:h-64">
        {"\u5730\u56f3\u3092\u8aad\u307f\u8fbc\u307f\u4e2d\u2026"}
      </div>
    ),
  },
);

/** 表示は日本語、値は IANA（API・保存用） */
const TIME_ZONE_PRESETS: { value: string; labelJa: string }[] = [
  { value: "Asia/Tokyo", labelJa: "日本（東京）" },
  { value: "Asia/Seoul", labelJa: "韓国（ソウル）" },
  { value: "Asia/Shanghai", labelJa: "中国（上海）" },
  { value: "Asia/Singapore", labelJa: "シンガポール" },
  { value: "Asia/Dubai", labelJa: "ドバイ" },
  { value: "Europe/London", labelJa: "イギリス（ロンドン）" },
  { value: "Europe/Paris", labelJa: "フランス（パリ）" },
  { value: "America/New_York", labelJa: "アメリカ東部（ニューヨーク）" },
  { value: "America/Chicago", labelJa: "アメリカ中部（シカゴ）" },
  { value: "America/Los_Angeles", labelJa: "アメリカ西部（ロサンゼルス）" },
  { value: "Australia/Sydney", labelJa: "オーストラリア（シドニー）" },
  { value: "UTC", labelJa: "協定世界時（UTC）" },
];

type SettingsPayload = {
  email?: string;
  encryptionMode: "STANDARD" | "EXPERIMENTAL_E2EE";
  defaultWeatherLocation: {
    latitude: number;
    longitude: number;
    label?: string;
  } | null;
  /** 1日の区切り（前の日の終了時刻）。未設定は null */
  dayBoundaryEndTime: string | null;
  profile: UserProfilePayload;
  limits: {
    CHAT_PER_DAY: number;
    IMAGE_GEN_PER_DAY: number;
    DAILY_SUMMARY_PER_DAY: number;
    HOBBY_EXTERNAL_FETCH_PER_DAY?: number;
  };
  usageToday: {
    chatMessages: number;
    imageGenerations: number;
    dailySummaries: number;
    settingsChanges?: number;
    hobbyExternalFetches?: number;
  };
  promptVersions: Record<string, string>;
  /** 会話 Eval 用全文保存へのオプトイン（既定 false） */
  evaluationFullLogOptIn?: boolean;
  serverSyncToken?: string;
};

export function SettingsForm({ userId }: { userId: string }) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [latIn, setLatIn] = useState("");
  const [lonIn, setLonIn] = useState("");
  const [labelIn, setLabelIn] = useState("");
  const [dayBoundaryEndIn, setDayBoundaryEndIn] = useState("");
  const [timeZoneIn, setTimeZoneIn] = useState("");
  const [placeLine, setPlaceLine] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [opening, setOpening] = useState<CalendarOpeningSettings | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingOpts, setOpeningOpts] = useState<{
    calendars: { calendarId: string; calendarName: string; calendarColorId: string }[];
    colorIds: string[];
  } | null>(null);
  const [profileChatOpen, setProfileChatOpen] = useState(false);
  const [profileChatMode, setProfileChatMode] = useState<"chat" | "form">("chat");
  const [profileChatDraft, setProfileChatDraft] = useState<UserProfilePayload | null>(null);
  const [profileFormMountKey, setProfileFormMountKey] = useState(0);
  const [openingPriorityEditorOpen, setOpeningPriorityEditorOpen] = useState(false);
  const [categoryMultiplierEditorOpen, setCategoryMultiplierEditorOpen] = useState(false);
  const [categoryMultiplierRecommendOpen, setCategoryMultiplierRecommendOpen] = useState(false);
  const openingPriorityEditorTitleId = useId();
  const categoryMultiplierEditorTitleId = useId();
  const categoryMultiplierRecommendTitleId = useId();

  const applySettingsJson = useCallback((json: SettingsPayload & { defaultWeatherLocation?: unknown }) => {
    setData(json);
    const loc = json.defaultWeatherLocation as SettingsPayload["defaultWeatherLocation"] | undefined;
    if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
      setLatIn(String(loc.latitude));
      setLonIn(String(loc.longitude));
      setLabelIn(loc.label ?? "");
      void reverseGeocodeClient(loc.latitude, loc.longitude).then(setPlaceLine);
    } else {
      setLatIn("");
      setLonIn("");
      setLabelIn("");
      setPlaceLine(null);
    }
    setOpening((json.profile as UserProfilePayload | undefined)?.calendarOpening ?? null);
    setDayBoundaryEndIn(resolveDayBoundaryEndTime(json.dayBoundaryEndTime));
    const profTz = (json.profile as { timeZone?: string } | undefined)?.timeZone;
    setTimeZoneIn(typeof profTz === "string" ? profTz : "");
  }, []);

  const reloadSettingsFromServer = useCallback(async () => {
    const res = await fetch(`/api/settings?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as SettingsPayload & { error?: string };
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "読み込みに失敗しました");
      return;
    }
    setError(null);
    applySettingsJson(json);
  }, [applySettingsJson]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings", { cache: "no-store", credentials: "same-origin" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "読み込みに失敗しました");
        return;
      }
      applySettingsJson(json as SettingsPayload);
    })();
  }, [applySettingsJson]);

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
    setOpeningOpts({ calendars, colorIds });
  }, []);

  useEffect(() => {
    void reloadClassifierOptions();
  }, [reloadClassifierOptions]);

  const [appLocalCalendars, setAppLocalCalendars] = useState<
    { calendarId: string; name: string; displayName: string }[]
  >([]);
  const [appLocalBusy, setAppLocalBusy] = useState(false);
  const [newAppLocalName, setNewAppLocalName] = useState("");

  const loadAppLocalCalendars = useCallback(async () => {
    const res = await fetch("/api/calendar/local-calendars", { cache: "no-store", credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) return;
    if (!json || typeof json !== "object" || Array.isArray(json)) return;
    const raw = (json as Record<string, unknown>).calendars;
    if (!Array.isArray(raw)) return;
    const rows = raw
      .filter((x): x is { calendarId: string; name: string; displayName: string } => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return false;
        const r = x as Record<string, unknown>;
        return (
          typeof r.calendarId === "string" &&
          typeof r.name === "string" &&
          typeof r.displayName === "string"
        );
      })
      .slice(0, 100);
    setAppLocalCalendars(rows);
  }, []);

  useEffect(() => {
    void loadAppLocalCalendars();
  }, [loadAppLocalCalendars]);

  const refreshAppLocalAndClassifier = useCallback(async () => {
    await loadAppLocalCalendars();
    await reloadClassifierOptions();
  }, [loadAppLocalCalendars, reloadClassifierOptions]);

  useEffect(() => {
    function onRemote() {
      void reloadSettingsFromServer();
    }
    window.addEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onRemote);
    return () => window.removeEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onRemote);
  }, [reloadSettingsFromServer]);

  useEffect(() => {
    if (!profileChatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [profileChatOpen]);

  async function saveDefaultLocation() {
    const lat = parseFloat(latIn);
    const lon = parseFloat(lonIn);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError("緯度・経度は数値で入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultWeatherLocation: {
            latitude: lat,
            longitude: lon,
            ...(labelIn.trim() ? { label: labelIn.trim() } : {}),
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      const nw = json.user?.defaultWeatherLocation as
        | { latitude?: number; longitude?: number }
        | null
        | undefined;
      if (nw && typeof nw.latitude === "number" && typeof nw.longitude === "number") {
        setLatIn(String(nw.latitude));
        setLonIn(String(nw.longitude));
        void reverseGeocodeClient(nw.latitude, nw.longitude).then(setPlaceLine);
      } else {
        setPlaceLine(null);
      }
      setData((d) =>
        d
          ? {
              ...d,
              defaultWeatherLocation: json.user?.defaultWeatherLocation ?? null,
            }
          : d,
      );
      await reloadSettingsFromServer();
    } finally {
      setSaving(false);
    }
  }

  const onWeatherMapPick = useCallback((lat: number, lng: number) => {
    setLatIn(String(lat));
    setLonIn(String(lng));
    setPlaceLine(null);
    void reverseGeocodeClient(lat, lng).then(setPlaceLine);
  }, []);

  async function clearDefaultLocation() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultWeatherLocation: null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      setLatIn("");
      setLonIn("");
      setLabelIn("");
      setPlaceLine(null);
      setData((d) => (d ? { ...d, defaultWeatherLocation: null } : d));
      await reloadSettingsFromServer();
    } finally {
      setSaving(false);
    }
  }

  function requestDefaultLocationGeolocation() {
    if (!navigator.geolocation) {
      setError("この環境では位置情報が使えません");
      return;
    }
    setGeoBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setLatIn(String(la));
        setLonIn(String(lo));
        setGeoBusy(false);
        void reverseGeocodeClient(la, lo).then(setPlaceLine);
        window.dispatchEvent(new CustomEvent("daily-snap:weather-map:flyto", { detail: { lat: la, lng: lo, zoom: 13 } }));
      },
      () => {
        setGeoBusy(false);
        setError("位置情報の取得に失敗しました");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function saveDayBoundaryEndTime() {
    const raw = (dayBoundaryEndIn ?? "").trim();
    if (raw && !/^\d{2}:\d{2}$/.test(raw)) {
      setError("時刻は HH:mm（例: 02:00）で入力してください");
      return;
    }
    if (raw) {
      const [hhRaw, mmRaw] = raw.split(":");
      const hh = Number(hhRaw);
      const mm = Number(mmRaw);
      const mins = hh * 60 + mm;
      if (!Number.isFinite(mins) || mins > 6 * 60) {
        setError("区切り時刻は 00:00〜06:00 です（未設定で既定は 00:00）");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayBoundaryEndTime: raw ? raw : null,
        }),
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      await reloadSettingsFromServer();
    } finally {
      setSaving(false);
    }
  }

  function applyBrowserTimeZone() {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z) setTimeZoneIn(z);
    else setError("この環境ではタイムゾーンを取得できませんでした");
  }

  async function saveTimeZone() {
    const raw = timeZoneIn.trim();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { timeZone: raw } }),
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      await reloadSettingsFromServer();
    } finally {
      setSaving(false);
    }
  }

  async function saveMode(mode: "STANDARD" | "EXPERIMENTAL_E2EE") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptionMode: mode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      setData((d) =>
        d
          ? {
              ...d,
              encryptionMode: json.user.encryptionMode,
              ...(typeof json.user?.evaluationFullLogOptIn === "boolean"
                ? { evaluationFullLogOptIn: json.user.evaluationFullLogOptIn }
                : {}),
            }
          : d,
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveEvaluationFullLogOptIn(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationFullLogOptIn: next }),
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      setData((d) =>
        d
          ? {
              ...d,
              evaluationFullLogOptIn: Boolean(json.user?.evaluationFullLogOptIn),
            }
          : d,
      );
      await reloadSettingsFromServer();
    } finally {
      setSaving(false);
    }
  }

  const openingCatOptions = calendarOpeningCategoryOptions(opening);
  const openingRuleCats = openingCatOptions.map(({ id, label }) => ({ id, label }));

  async function saveCalendarOpening(next: CalendarOpeningSettings): Promise<boolean> {
    setOpeningBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { calendarOpening: next } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return false;
      }
      emitLocalSettingsSavedFromJson(json);
      await reloadSettingsFromServer();
      return true;
    } finally {
      setOpeningBusy(false);
    }
  }

  if (!data && !error) {
    return <p className="mt-3 text-sm text-zinc-500">読み込み中…</p>;
  }
  if (error && !data) {
    return <p className="mt-3 text-sm text-red-600">{error}</p>;
  }
  if (!data) return null;

  const pickedLat = parseFloat(latIn);
  const pickedLon = parseFloat(lonIn);
  const pickedOk = Number.isFinite(pickedLat) && Number.isFinite(pickedLon);
  const savedLoc = data.defaultWeatherLocation;
  const savedLat = typeof savedLoc?.latitude === "number" ? savedLoc.latitude : NaN;
  const savedLon = typeof savedLoc?.longitude === "number" ? savedLoc.longitude : NaN;
  const savedLabel = typeof savedLoc?.label === "string" ? savedLoc.label : "";
  const sameCoords =
    pickedOk && Number.isFinite(savedLat) && Number.isFinite(savedLon)
      ? Math.abs(pickedLat - savedLat) < 1e-6 && Math.abs(pickedLon - savedLon) < 1e-6
      : !pickedOk && !Number.isFinite(savedLat) && !Number.isFinite(savedLon);
  const sameLabel = (labelIn ?? "").trim() === (savedLabel ?? "").trim();
  const locationIsSynced = sameCoords && sameLabel;

  return (
    <>
      <div className="mt-3 w-full min-w-0 space-y-3">
      {!data.profile?.onboardingCompletedAt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">初回の「はじめに」が未完了です</p>
          <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
            「今日」ページを開くには、プロフィールの保存またはスキップが必要です。
          </p>
          <Link
            href="/onboarding"
            className="mt-2 inline-block text-sm font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-200"
          >
            はじめにページへ
          </Link>
        </div>
      )}

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">暗号化</h2>
        <p className="mt-1 text-xs text-zinc-500">
          実験的 E2EE は本文のみ。パスフレーズ紛失時は復旧できません（後続で鍵束・32 文字要件を実装）。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveMode("STANDARD")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              data.encryptionMode === "STANDARD"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-200 dark:border-zinc-700"
            }`}
          >
            標準
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveMode("EXPERIMENTAL_E2EE")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              data.encryptionMode === "EXPERIMENTAL_E2EE"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-200 dark:border-zinc-700"
            }`}
          >
            実験（E2EE）
          </button>
        </div>
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">品質改善への協力（任意）</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          チェックを入れると、会話のユーザー発話と AI
          返答の全文を、サービス品質の分析にのみ利用する目的で保存できます。実験的 E2EE
          の日記では保存されません。いつでもオフにできます。
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-900"
            checked={Boolean(data.evaluationFullLogOptIn)}
            disabled={saving}
            onChange={(e) => void saveEvaluationFullLogOptIn(e.target.checked)}
          />
          <span>会話テキストを品質改善のため保存することに同意する</span>
        </label>
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">日付の区切りとタイムゾーン</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">タイムゾーン</strong>
          は、日付表示や1日の利用上限の切り替えに使います。
          <span className="mx-1 text-zinc-400">/</span>
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">日付の区切り</strong>
          は、深夜でも前日扱いにする「終了時刻」です（
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">0:00 起点</strong>・0:00〜6:00）。未設定は 0:00 です。
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">タイムゾーン</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[12rem]">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">地域</span>
              <FancySelect
                value={timeZoneIn}
                disabled={saving}
                onChange={(e) => setTimeZoneIn(e.target.value)}
                className="h-8 min-h-8 rounded-xl border border-zinc-200 bg-white px-2.5 py-0 text-xs leading-none shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20 !py-0 !text-xs"
                aria-label="タイムゾーン候補"
              >
                <option value="">一覧から選ぶ</option>
                {timeZoneIn && !TIME_ZONE_PRESETS.some((p) => p.value === timeZoneIn) ? (
                  <option value={timeZoneIn}>{timeZoneIn}（一覧外・保存中）</option>
                ) : null}
                {TIME_ZONE_PRESETS.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.labelJa}
                  </option>
                ))}
              </FancySelect>
            </label>
            <div className="flex shrink-0 flex-row flex-wrap items-center gap-2">
              <SettingsActionIconButton
                variant="outline"
                label="この端末のタイムゾーンを使う"
                disabled={saving}
                onClick={() => applyBrowserTimeZone()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </SettingsActionIconButton>
              <SettingsActionIconButton
                variant="primary"
                label="タイムゾーンを保存"
                disabled={saving}
                onClick={() => void saveTimeZone()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </SettingsActionIconButton>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">前の日が終わる時刻</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            下の時刻は「前日がここで終わる」＝その分だけ深夜も前日のエントリに含めます。入力欄は 0:00 起点です（未入力で保存すると既定 0:00 が使われます）。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={saving}
                onClick={() => setDayBoundaryEndIn(preset)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="w-full text-xs font-medium text-zinc-700 sm:w-auto dark:text-zinc-200">
              時刻（0:00〜6:00）
            </span>
            <input
              type="time"
              min="00:00"
              max="06:00"
              step={60}
              value={dayBoundaryEndIn}
              disabled={saving}
              onChange={(e) => setDayBoundaryEndIn(e.target.value)}
              className="h-8 w-[7.25rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-0 text-xs font-medium tabular-nums shadow-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60 dark:border-zinc-600 dark:bg-zinc-950 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
              aria-label="前の日の終了時刻"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveDayBoundaryEndTime()}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-2.5 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              区切りを保存
            </button>
          </div>
          <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300" aria-live="polite">
            {data.dayBoundaryEndTime
              ? data.dayBoundaryEndTime === "00:00"
                ? "保存済み: 00:00（カレンダーの日付どおり・深夜の前日繰り越しなし）"
                : `保存済み: ${data.dayBoundaryEndTime} まで前日扱い`
              : "保存なし → アプリ既定の 00:00（カレンダーの日付どおり）"}
          </p>
        </div>
        </div>
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <UserProfileForm
          key={data.serverSyncToken ?? "profile"}
          initial={hydrateProfilePayloadForForms(data.profile ?? {})}
          onSaved={() => void reloadSettingsFromServer()}
          headerActions={
            <button
              type="button"
              onClick={() => {
                setProfileChatDraft((prev) => prev ?? hydrateProfilePayloadForForms(data.profile ?? {}));
                setProfileChatMode("chat");
                setProfileChatOpen(true);
              }}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50 sm:text-sm"
            >
              チャットで編集
            </button>
          }
        />
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">日記チャットの開口トピック（カレンダー分類）</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          日記でチャットを開いたとき、当日の Google カレンダー予定からどの話題として声をかけるかを決めるルールです（優先順位・キーワードルール等）。カレンダー画面の表示設定ダイアログには出さず、ここでのみ編集します。曖昧な予定は「どんな予定？」と確認します。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                カテゴリの優先順位（上ほど優先）
              </p>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => setOpeningPriorityEditorOpen(true)}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:px-3 sm:text-sm"
              >
                設定
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              カレンダー予定の分類・開口トピック用の並びです。趣味・関心タグなどはプロフィール側の別ストリームでスコアだけ微調整され、このリストには混ざりません。
            </p>
            <p className="mt-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
              {(() => {
                const order = normalizeCalendarOpeningPriorityOrder(opening);
                const labelFor = (id: CalendarOpeningCategory) =>
                  openingCatOptions.find((c) => c.id === id)?.label ?? id;
                const head = order.slice(0, 4).map(labelFor).join(" → ");
                const tail = order.length > 4 ? ` …（全${order.length}件）` : "";
                return `現在の順（先頭から）: ${head}${tail}`;
              })()}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                カテゴリ別倍率（インパクト）
              </p>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => setCategoryMultiplierEditorOpen(true)}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:px-3 sm:text-sm"
              >
                設定
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              開口の分類スコアに掛ける倍率です。近さ（開始までの時間）とは別に効きます。1.0 は既定で、未保存のときはサーバーに書き込みません。
            </p>
            <p className="mt-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
              {Object.keys(opening?.categoryMultiplierById ?? {}).length === 0
                ? "現在はすべて既定（1.0）です。"
                : `${Object.keys(opening?.categoryMultiplierById ?? {}).length} 件のカテゴリで倍率を変更中（未保存の変更を含む場合があります）。`}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">分類ルール</p>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              キーワード/カレンダーID/色ID/場所/メモに含まれる文字でカテゴリを加点します（部分一致）。
            </p>
            <div className="mt-2 space-y-2">
              {(opening?.rules ?? []).map((r, i) => (
                <RuleRow
                  key={i}
                  rule={r}
                  disabled={openingBusy}
                  cats={openingRuleCats}
                  calendars={openingOpts?.calendars ?? []}
                  colorIds={openingOpts?.colorIds ?? []}
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
                disabled={openingBusy}
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
              disabled={openingBusy}
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
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">天気の既定の地点</h2>
        <p className="mt-1 text-xs text-zinc-500">
          エントリに位置がないときの天気取得（午前・午後）に使います。エントリに位置を保存した場合はそちらが優先されます。
        </p>
        <PlaceCoordsLine
          placeLine={placeLine}
          latitude={pickedOk ? pickedLat : NaN}
          longitude={pickedOk ? pickedLon : NaN}
          showCoordinates={false}
        />
        <div className="mt-3">
          <WeatherLocationMapPicker
            latitude={pickedOk ? pickedLat : null}
            longitude={pickedOk ? pickedLon : null}
            savedLatitude={typeof data.defaultWeatherLocation?.latitude === "number" ? data.defaultWeatherLocation.latitude : null}
            savedLongitude={typeof data.defaultWeatherLocation?.longitude === "number" ? data.defaultWeatherLocation.longitude : null}
            onPick={onWeatherMapPick}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {"\u5730\u56f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u304b\u3001\u30d4\u30f3\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u5730\u70b9\u3092\u6307\u5b9a\u3067\u304d\u307e\u3059\uff08OpenStreetMap\uff09\u3002"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={labelIn}
            onChange={(e) => setLabelIn(e.target.value)}
            aria-label="表示名（任意）"
            placeholder="表示名（任意）・自宅など"
            className="min-w-[10rem] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm outline-none placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60 dark:border-zinc-700 dark:bg-zinc-950 dark:placeholder:text-zinc-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20 sm:min-w-[12rem]"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDefaultLocation()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            既定地点を保存
          </button>
          <button
            type="button"
            disabled={saving || geoBusy}
            onClick={() => requestDefaultLocationGeolocation()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            {geoBusy ? "…" : "現在地"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void clearDefaultLocation()}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            クリア
          </button>
          <span
            className={[
              "text-[11px] font-medium",
              locationIsSynced ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300",
            ].join(" ")}
            aria-live="polite"
          >
            {locationIsSynced ? "保存済み" : "未保存"}
          </span>
        </div>
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">本日の利用状況</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            チャット: {data.usageToday.chatMessages} / {data.limits.CHAT_PER_DAY}
          </li>
          <li>
            画像生成: {data.usageToday.imageGenerations} / {data.limits.IMAGE_GEN_PER_DAY}
          </li>
          <li>
            日次要約: {data.usageToday.dailySummaries} / {data.limits.DAILY_SUMMARY_PER_DAY}
          </li>
          {typeof data.limits.HOBBY_EXTERNAL_FETCH_PER_DAY === "number" &&
          typeof data.usageToday.hobbyExternalFetches === "number" ? (
            <li>
              趣味・外部取得: {data.usageToday.hobbyExternalFetches} /{" "}
              {data.limits.HOBBY_EXTERNAL_FETCH_PER_DAY}
            </li>
          ) : null}
        </ul>
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">アプリ内カレンダー</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Google に同期せず、このアプリのデータベースだけに保存するカレンダーです。一覧では「名前(アプリ)」のように表示されます。削除するとそのカレンダー上の予定もすべて消えます。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={newAppLocalName}
            onChange={(e) => setNewAppLocalName(e.target.value)}
            placeholder="新しいカレンダー名"
            aria-label="新しいアプリ内カレンダー名"
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            disabled={appLocalBusy || !newAppLocalName.trim()}
            onClick={() => {
              void (async () => {
                setAppLocalBusy(true);
                setError(null);
                try {
                  const res = await fetch("/api/calendar/local-calendars", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newAppLocalName }),
                    credentials: "same-origin",
                  });
                  const json = (await res.json().catch(() => ({}))) as { error?: string };
                  if (!res.ok) {
                    setError(typeof json.error === "string" ? json.error : "追加に失敗しました");
                    return;
                  }
                  setNewAppLocalName("");
                  await refreshAppLocalAndClassifier();
                } finally {
                  setAppLocalBusy(false);
                }
              })();
            }}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            追加
          </button>
        </div>
        {appLocalCalendars.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            まだありません。上で名前を付けて追加するか、カレンダー画面の表示設定からも追加できます。
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {appLocalCalendars.map((row) => (
              <AppLocalCalendarSettingsRow
                key={row.calendarId}
                row={row}
                disabled={appLocalBusy}
                onBusy={setAppLocalBusy}
                onError={setError}
                onMutate={() => void refreshAppLocalAndClassifier()}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">プロンプト版</h2>
        <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {Object.entries(data.promptVersions).map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      </section>

      <SettingsMemoryPanel />

      <SettingsAccountActions email={data.email} />
      </div>

      {profileChatOpen && profileChatDraft ? (
        <div
          className="fixed inset-0 z-[240] flex max-h-[100dvh] min-h-0 flex-col bg-zinc-50 dark:bg-zinc-950"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-profile-chat-title"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] dark:border-zinc-800">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">設定</p>
              <h2
                id="settings-profile-chat-title"
                className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50"
              >
                プロフィール
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setProfileChatOpen(false);
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              閉じる
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {profileChatMode === "chat" ? (
              <OnboardingChatFlow
                userId={userId}
                draft={profileChatDraft}
                onDraftChange={(patch) =>
                  setProfileChatDraft((d) => (d ? { ...d, ...patch } : d))
                }
                onDone={() => {
                  setProfileChatOpen(false);
                  setProfileChatDraft(null);
                  void reloadSettingsFromServer();
                }}
                onOpenFormMode={() => {
                  setProfileFormMountKey((k) => k + 1);
                  setProfileChatMode("form");
                }}
                completeButtonLabel="保存して閉じる"
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden pt-3">
                <button
                  type="button"
                  onClick={() => setProfileChatMode("chat")}
                  className="shrink-0 text-left text-sm text-emerald-700 underline dark:text-emerald-400"
                >
                  ← チャット形式に戻る（入力内容は引き継がれます）
                </button>
                <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                  <UserProfileForm
                    key={profileFormMountKey}
                    showTitle={false}
                    initial={profileChatDraft}
                    value={profileChatDraft}
                    onValuesChange={setProfileChatDraft}
                    onSaved={() => {
                      setProfileChatOpen(false);
                      setProfileChatDraft(null);
                      void reloadSettingsFromServer();
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ResponsiveDialog
        open={openingPriorityEditorOpen}
        onClose={() => setOpeningPriorityEditorOpen(false)}
        labelledBy={openingPriorityEditorTitleId}
        dialogId="settings-opening-priority-editor"
        zClass="z-[250]"
        presentation="sheet"
        panelClassName="!max-w-2xl"
      >
        <div className="flex max-h-[min(92dvh,52rem)] min-h-0 w-full flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3 sm:px-5 dark:border-zinc-800">
            <h2
              id={openingPriorityEditorTitleId}
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              カテゴリの優先順位（上ほど優先）
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              ここはカレンダー予定の分類・開口トピック用です。趣味・関心タグや「避けたい話題」「いま関心が高いもの」はプロフィール側の別ストリームとしてスコアにだけ微調整され、この優先リストには混ぜません。
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            <CalendarOpeningPriorityEditor
              priorityList={normalizeCalendarOpeningPriorityOrder(opening)}
              catOptions={openingCatOptions}
              disabled={openingBusy}
              onSetPriorityOrder={(next) =>
                setOpening((prev) => {
                  const base = { ...(prev ?? {}) };
                  const current = normalizeCalendarOpeningPriorityOrder(base);
                  const resolved = typeof next === "function" ? next(current) : next;
                  return { ...base, priorityOrder: resolved };
                })
              }
            />
          </div>
          <div className="shrink-0 space-y-2 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => setOpeningPriorityEditorOpen(false)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto"
              >
                閉じる
              </button>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() =>
                  void (async () => {
                    const ok = await saveCalendarOpening({
                      ...(opening ?? {}),
                      priorityOrder: normalizeCalendarOpeningPriorityOrder(opening),
                    });
                    if (ok) setOpeningPriorityEditorOpen(false);
                  })()
                }
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 sm:w-auto"
              >
                優先順位を保存
              </button>
            </div>
          </div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={categoryMultiplierEditorOpen}
        onClose={() => setCategoryMultiplierEditorOpen(false)}
        labelledBy={categoryMultiplierEditorTitleId}
        dialogId="settings-category-multiplier-editor"
        zClass="z-[250]"
        presentation="sheet"
        panelClassName="!max-w-2xl"
      >
        <div className="flex max-h-[min(92dvh,52rem)] min-h-0 w-full flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3 sm:px-5 dark:border-zinc-800">
            <h2
              id={categoryMultiplierEditorTitleId}
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              カテゴリ別倍率（インパクト）
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              開口の「インパクト（分類スコア）」側に掛ける倍率です（例: 授業=1.5）。近さ（開始までの時間）とは別に効きます。1.0
              は既定として扱い、保存しません。
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {openingCatOptions.map((c) => {
                const v = (opening?.categoryMultiplierById ?? {})[c.id];
                const shown = typeof v === "number" && Number.isFinite(v) ? String(v) : "";
                return (
                  <label
                    key={c.id}
                    className="flex min-h-[2.75rem] items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200 sm:truncate">
                      {c.custom ? `${c.label}（カスタム）` : c.label}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.05"
                      min="0.2"
                      max="3"
                      placeholder="1.0"
                      value={shown}
                      disabled={openingBusy}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw.trim() === "" ? NaN : Number(raw);
                        setOpening((prev) => {
                          const base = { ...(prev ?? {}) };
                          const cur = { ...(base.categoryMultiplierById ?? {}) } as Record<string, number>;
                          if (!Number.isFinite(n)) {
                            delete cur[c.id];
                          } else {
                            const clamped = Math.max(0.2, Math.min(3, n));
                            if (Math.abs(clamped - 1) < 1e-9) delete cur[c.id];
                            else cur[c.id] = clamped;
                          }
                          if (Object.keys(cur).length === 0) {
                            delete (base as { categoryMultiplierById?: unknown }).categoryMultiplierById;
                            return base;
                          }
                          return { ...base, categoryMultiplierById: cur };
                        });
                      }}
                      className="w-[5.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950 sm:w-24"
                      aria-label={`${c.label} 倍率`}
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 space-y-2 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => setCategoryMultiplierEditorOpen(false)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto"
              >
                閉じる
              </button>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => setCategoryMultiplierRecommendOpen(true)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto"
              >
                おすすめを適用
              </button>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() =>
                  void (async () => {
                    const ok = await saveCalendarOpening({
                      ...(opening ?? {}),
                      priorityOrder: normalizeCalendarOpeningPriorityOrder(opening),
                      rules: opening?.rules ?? [],
                      categoryMultiplierById: opening?.categoryMultiplierById,
                    });
                    if (ok) setCategoryMultiplierEditorOpen(false);
                  })()
                }
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 sm:w-auto"
              >
                倍率を保存
              </button>
            </div>
          </div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={categoryMultiplierRecommendOpen}
        onClose={() => setCategoryMultiplierRecommendOpen(false)}
        labelledBy={categoryMultiplierRecommendTitleId}
        dialogId="settings-category-multiplier-recommend"
        zClass="z-[260]"
        presentation="sheet"
        panelClassName="!max-w-2xl"
      >
        <div className="flex max-h-[min(92dvh,52rem)] min-h-0 w-full flex-col">
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3 sm:px-5 dark:border-zinc-800">
            <h2
              id={categoryMultiplierRecommendTitleId}
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              おすすめの倍率プリセット
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              授業・就活・記念日・通院などをやや強め、バイト・家族・趣味は控えめに上げます。「その他」は既定のままです。カスタムカテゴリの倍率は消えません。反映後は親モーダル下部の「倍率を保存」でサーバーに書き込んでください。
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
              {CALENDAR_OPENING_BUILTIN_CATS.map(({ id, label }) => {
                const rec = RECOMMENDED_CALENDAR_OPENING_CATEGORY_IMPACT_MULTIPLIERS[id];
                const mult =
                  typeof rec === "number" && Number.isFinite(rec) ? Math.max(0.2, Math.min(3, rec)) : 1;
                return (
                  <li
                    key={id}
                    className="flex min-h-[2.75rem] items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200 sm:truncate">{label}</span>
                    <span className="shrink-0 tabular-nums text-sm text-zinc-600 dark:text-zinc-400">
                      {Math.abs(mult - 1) < 1e-9 ? "1.0（既定）" : `×${mult.toFixed(2)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="shrink-0 space-y-2 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => setCategoryMultiplierRecommendOpen(false)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto"
              >
                閉じる
              </button>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => {
                  const merged = mergeRecommendedCalendarOpeningImpactMultipliers(opening?.categoryMultiplierById);
                  setOpening((prev) => {
                    const base = { ...(prev ?? {}) };
                    if (!merged) {
                      delete base.categoryMultiplierById;
                      return base;
                    }
                    return { ...base, categoryMultiplierById: merged };
                  });
                  setCategoryMultiplierRecommendOpen(false);
                }}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:w-auto"
              >
                フォームにだけ反映
              </button>
              <button
                type="button"
                disabled={openingBusy}
                onClick={() => {
                  const merged = mergeRecommendedCalendarOpeningImpactMultipliers(opening?.categoryMultiplierById);
                  void (async () => {
                    const ok = await saveCalendarOpening({
                      ...(opening ?? {}),
                      priorityOrder: normalizeCalendarOpeningPriorityOrder(opening),
                      rules: opening?.rules ?? [],
                      categoryMultiplierById: merged,
                    });
                    if (ok) setCategoryMultiplierRecommendOpen(false);
                  })();
                }}
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 sm:w-auto"
              >
                反映して保存
              </button>
            </div>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}

function AppLocalCalendarSettingsRow({
  row,
  disabled,
  onBusy,
  onError,
  onMutate,
}: {
  row: { calendarId: string; name: string; displayName: string };
  disabled: boolean;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onMutate: () => void;
}) {
  const [draftName, setDraftName] = useState(row.name);
  useEffect(() => {
    setDraftName(row.name);
  }, [row.name]);

  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{row.displayName}</p>
      <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{row.calendarId}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          aria-label={`${row.displayName}の名前`}
          className="min-w-[10rem] flex-1 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="button"
          disabled={disabled || draftName.normalize("NFKC").trim() === row.name}
          onClick={() => {
            void (async () => {
              onBusy(true);
              onError(null);
              try {
                const res = await fetch("/api/calendar/local-calendars", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ calendarId: row.calendarId, name: draftName }),
                  credentials: "same-origin",
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) {
                  onError(typeof json.error === "string" ? json.error : "名前の更新に失敗しました");
                  return;
                }
                onMutate();
              } finally {
                onBusy(false);
              }
            })();
          }}
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium dark:border-zinc-700"
        >
          名前を保存
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (
              !confirm(
                `「${row.displayName}」を削除しますか？\nこのカレンダー上の予定はすべて消え、元に戻せません。`,
              )
            ) {
              return;
            }
            void (async () => {
              onBusy(true);
              onError(null);
              try {
                const res = await fetch("/api/calendar/local-calendars", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ calendarId: row.calendarId }),
                  credentials: "same-origin",
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) {
                  onError(typeof json.error === "string" ? json.error : "削除に失敗しました");
                  return;
                }
                onMutate();
              } finally {
                onBusy(false);
              }
            })();
          }}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 underline dark:text-red-400"
        >
          削除
        </button>
      </div>
    </li>
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
      <FancySelect
        value={rule.value}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        className="w-full px-2 py-1 text-sm"
      >
        <option value="">（選ぶ）</option>
        {calendars.map((c) => (
          <option key={c.calendarId} value={c.calendarId}>
            {c.calendarName} ({c.calendarId})
          </option>
        ))}
      </FancySelect>
    ) : kind === "colorId" ? (
      <FancySelect
        value={rule.value}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        className="w-full px-2 py-1 text-sm"
      >
        <option value="">（選ぶ）</option>
        {colorIds.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </FancySelect>
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
      <FancySelect
        value={rule.kind}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, kind: e.target.value as CalendarOpeningRule["kind"], value: "" })}
        className="px-2 py-1 text-sm sm:col-span-3"
      >
        <option value="keyword">キーワード</option>
        <option value="calendarId">カレンダー</option>
        <option value="colorId">色</option>
        <option value="location">場所</option>
        <option value="description">メモ</option>
      </FancySelect>
      <div className="sm:col-span-4">{valueInput}</div>
      <FancySelect
        value={rule.category}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, category: e.target.value as CalendarOpeningCategory })}
        className="px-2 py-1 text-sm sm:col-span-3"
      >
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </FancySelect>
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
