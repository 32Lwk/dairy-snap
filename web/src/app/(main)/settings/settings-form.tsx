"use client";

import { CalendarOpeningPriorityEditor } from "@/components/calendar-opening-priority-editor";
import { PlaceCoordsLine } from "@/components/place-coords-line";
import { SettingsAccountActions } from "@/components/settings-account-actions";
import { SettingsMemoryPanel } from "@/components/settings-memory-panel";
import { UserProfileForm, type UserProfilePayload } from "@/components/user-profile-form";
import type {
  CalendarOpeningCategory,
  CalendarOpeningRule,
  CalendarOpeningSettings,
} from "@/lib/user-settings";
import {
  calendarOpeningCategoryOptions,
  hydrateProfilePayloadForForms,
  normalizeCalendarOpeningPriorityOrder,
} from "@/lib/user-settings";
import {
  emitLocalSettingsSavedFromJson,
  REMOTE_SETTINGS_UPDATED_EVENT,
} from "@/lib/settings-sync-client";
import { reverseGeocodeClient } from "@/lib/reverse-geocode-client";
import { OnboardingChatFlow } from "@/app/(main)/onboarding/onboarding-chat-flow";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

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

type SettingsPayload = {
  email?: string;
  encryptionMode: "STANDARD" | "EXPERIMENTAL_E2EE";
  defaultWeatherLocation: {
    latitude: number;
    longitude: number;
    label?: string;
  } | null;
  profile: UserProfilePayload;
  limits: {
    CHAT_PER_DAY: number;
    IMAGE_GEN_PER_DAY: number;
    DAILY_SUMMARY_PER_DAY: number;
  };
  usageToday: {
    chatMessages: number;
    imageGenerations: number;
    dailySummaries: number;
  };
  promptVersions: Record<string, string>;
  serverSyncToken?: string;
};

export function SettingsForm({ userId }: { userId: string }) {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [latIn, setLatIn] = useState("");
  const [lonIn, setLonIn] = useState("");
  const [labelIn, setLabelIn] = useState("");
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
    } finally {
      setSaving(false);
    }
  }

  function useDefaultLocationGeolocation() {
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
      },
      () => {
        setGeoBusy(false);
        setError("位置情報の取得に失敗しました");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
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
      setData((d) => (d ? { ...d, encryptionMode: json.user.encryptionMode } : d));
    } finally {
      setSaving(false);
    }
  }

  const openingCatOptions = calendarOpeningCategoryOptions(opening);
  const openingRuleCats = openingCatOptions.map(({ id, label }) => ({ id, label }));

  async function saveCalendarOpening(next: CalendarOpeningSettings) {
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
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      await reloadSettingsFromServer();
    } finally {
      setOpeningBusy(false);
    }
  }

  if (!data && !error) {
    return <p className="mt-6 text-sm text-zinc-500">読み込み中…</p>;
  }
  if (error && !data) {
    return <p className="mt-6 text-sm text-red-600">{error}</p>;
  }
  if (!data) return null;

  const pickedLat = parseFloat(latIn);
  const pickedLon = parseFloat(lonIn);
  const pickedOk = Number.isFinite(pickedLat) && Number.isFinite(pickedLon);

  return (
    <>
      <div className="mt-6 w-full min-w-0 space-y-6">
      {data.email && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ログイン中: <span className="font-medium">{data.email}</span>
        </p>
      )}
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
        <UserProfileForm
          key={data.serverSyncToken ?? "profile"}
          initial={hydrateProfilePayloadForForms(data.profile ?? {})}
          onSaved={() => void reloadSettingsFromServer()}
          headerActions={
            <button
              type="button"
              onClick={() => {
                setProfileChatDraft(hydrateProfilePayloadForForms(data.profile ?? {}));
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
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">カテゴリの優先順位（上ほど優先）</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              ここはカレンダー予定の分類・開口トピック用です。趣味・関心タグや「避けたい話題」「いま関心が高いもの」はプロフィール側の別ストリームとしてスコアにだけ微調整され、この優先リストには混ぜません。
            </p>
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
            <button
              type="button"
              disabled={openingBusy}
              onClick={() =>
                void saveCalendarOpening({
                  ...(opening ?? {}),
                  priorityOrder: normalizeCalendarOpeningPriorityOrder(opening),
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
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">天気の既定の地点</h2>
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
            onPick={onWeatherMapPick}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {"\u5730\u56f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u304b\u3001\u30d4\u30f3\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u5730\u70b9\u3092\u6307\u5b9a\u3067\u304d\u307e\u3059\uff08OpenStreetMap\uff09\u3002"}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={labelIn}
            onChange={(e) => setLabelIn(e.target.value)}
            aria-label="表示名（任意）"
            placeholder="表示名（任意）・自宅など"
            className="min-w-[10rem] flex-1 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:min-w-[12rem]"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDefaultLocation()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            既定地点を保存
          </button>
          <button
            type="button"
            disabled={saving || geoBusy}
            onClick={() => useDefaultLocationGeolocation()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {geoBusy ? "…" : "現在地"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void clearDefaultLocation()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            クリア
          </button>
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
        </ul>
      </section>

      <section className="w-full min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">アプリ内カレンダー</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Google に同期せず、このアプリのデータベースだけに保存するカレンダーです。一覧では「名前(アプリ)」のように表示されます。削除するとそのカレンダー上の予定もすべて消えます。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={newAppLocalName}
            onChange={(e) => setNewAppLocalName(e.target.value)}
            placeholder="新しいカレンダー名"
            aria-label="新しいアプリ内カレンダー名"
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            追加
          </button>
        </div>
        {appLocalCalendars.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">まだありません。上で名前を付けて追加するか、カレンダー画面の表示設定からも追加できます。</p>
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
                setProfileChatDraft(null);
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
