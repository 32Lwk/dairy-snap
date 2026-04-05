"use client";

import { SettingsAccountActions } from "@/components/settings-account-actions";
import { UserProfileForm, type UserProfilePayload } from "@/components/user-profile-form";
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
