"use client";

import { SettingsAccountActions } from "@/components/settings-account-actions";
import { UserProfileForm, type UserProfilePayload } from "@/components/user-profile-form";
import type {
  CalendarOpeningCategory,
  CalendarOpeningRule,
  CalendarOpeningSettings,
} from "@/lib/user-settings";
import { hydrateProfilePayloadForForms } from "@/lib/user-settings";
import {
  emitLocalSettingsSavedFromJson,
  REMOTE_SETTINGS_UPDATED_EVENT,
} from "@/lib/settings-sync-client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

export function SettingsForm() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [latIn, setLatIn] = useState("");
  const [lonIn, setLonIn] = useState("");
  const [labelIn, setLabelIn] = useState("");
  const [opening, setOpening] = useState<CalendarOpeningSettings | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingOpts, setOpeningOpts] = useState<{
    calendars: { calendarId: string; calendarName: string; calendarColorId: string }[];
    colorIds: string[];
  } | null>(null);

  const applySettingsJson = useCallback((json: SettingsPayload & { defaultWeatherLocation?: unknown }) => {
    setData(json);
    const loc = json.defaultWeatherLocation as SettingsPayload["defaultWeatherLocation"] | undefined;
    if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
      setLatIn(String(loc.latitude));
      setLonIn(String(loc.longitude));
      setLabelIn(loc.label ?? "");
    } else {
      setLatIn("");
      setLonIn("");
      setLabelIn("");
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

  useEffect(() => {
    // 分類編集の候補（DBキャッシュ由来）を取得
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
      setOpeningOpts({ calendars, colorIds });
    })();
  }, []);

  useEffect(() => {
    function onRemote() {
      void reloadSettingsFromServer();
    }
    window.addEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onRemote);
    return () => window.removeEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onRemote);
  }, [reloadSettingsFromServer]);

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
      setData((d) => (d ? { ...d, defaultWeatherLocation: null } : d));
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
      setData((d) => (d ? { ...d, encryptionMode: json.user.encryptionMode } : d));
    } finally {
      setSaving(false);
    }
  }

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
    // 足りない分はデフォルト順で埋め、重複排除
    const uniq = Array.from(new Set([...filtered, ...CATS.map((c) => c.id)]));
    return uniq.slice(0, CATS.length);
  }

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

  return (
    <div className="mt-6 space-y-6">
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

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
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

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <UserProfileForm
          key={data.serverSyncToken ?? "profile"}
          initial={hydrateProfilePayloadForForms(data.profile ?? {})}
          onSaved={() => void reloadSettingsFromServer()}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">開口メッセージの話題（カレンダー分類）</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          当日のGoogleカレンダー予定がある場合、どの話題として声をかけるかを重み付けします。曖昧な予定は「どんな予定？」と確認します。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">カテゴリの優先順位（上ほど優先）</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {normalizePriorityOrder(opening?.priorityOrder).map((cat, idx) => (
                <label key={idx} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="w-6 shrink-0 text-[11px] text-zinc-500">#{idx + 1}</span>
                  <select
                    value={cat}
                    disabled={openingBusy}
                    onChange={(e) => {
                      const cur = normalizePriorityOrder(opening?.priorityOrder);
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
              disabled={openingBusy}
              onClick={() =>
                void saveCalendarOpening({
                  ...(opening ?? {}),
                  priorityOrder: normalizePriorityOrder(opening?.priorityOrder),
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
                  cats={CATS}
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
              onClick={() => void saveCalendarOpening(opening ?? { priorityOrder: normalizePriorityOrder(undefined), rules: [] })}
              className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              ルールを保存
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">天気の既定の地点</h2>
        <p className="mt-1 text-xs text-zinc-500">
          エントリに位置がないときの天気取得（午前・午後）に使います。エントリに位置を保存した場合はそちらが優先されます。
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            緯度
            <input
              value={latIn}
              onChange={(e) => setLatIn(e.target.value)}
              className="ml-1 w-28 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              inputMode="decimal"
            />
          </label>
          <label className="text-xs text-zinc-600 dark:text-zinc-400">
            経度
            <input
              value={lonIn}
              onChange={(e) => setLonIn(e.target.value)}
              className="ml-1 w-28 rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              inputMode="decimal"
            />
          </label>
          <label className="min-w-0 flex-1 text-xs text-zinc-600 dark:text-zinc-400 sm:min-w-[8rem]">
            表示名（任意）
            <input
              value={labelIn}
              onChange={(e) => setLabelIn(e.target.value)}
              className="ml-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="自宅など"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
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
            disabled={saving}
            onClick={() => void clearDefaultLocation()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            クリア
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
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

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">プロンプト版</h2>
        <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {Object.entries(data.promptVersions).map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      </section>

      <SettingsAccountActions email={data.email} />
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
