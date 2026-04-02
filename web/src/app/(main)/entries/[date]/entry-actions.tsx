"use client";

import { WeatherAmPmDisplay } from "@/components/weather-am-pm-display";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type WeatherJson = {
  kind?: string;
  weatherLabel?: string;
  temperature_2m?: number;
  period?: string;
  fetchedAt?: string;
  locationSource?: string;
  locationNote?: string;
  dataSource?: "forecast" | "archive";
  am?: {
    time?: string;
    weatherLabel?: string;
    temperatureC?: number | null;
    weatherCode?: number | null;
  };
  pm?: {
    time?: string;
    weatherLabel?: string;
    temperatureC?: number | null;
    weatherCode?: number | null;
  };
  date?: string;
};

export function EntryActions({
  entryId,
  latitude,
  longitude,
  weatherJson,
}: {
  entryId: string;
  latitude: number | null;
  longitude: number | null;
  weatherJson: unknown;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [latIn, setLatIn] = useState(latitude != null ? String(latitude) : "");
  const [lonIn, setLonIn] = useState(longitude != null ? String(longitude) : "");

  const wj = weatherJson as WeatherJson | null;

  useEffect(() => {
    setLatIn(latitude != null ? String(latitude) : "");
    setLonIn(longitude != null ? String(longitude) : "");
  }, [latitude, longitude]);

  async function run(kind: "title" | "tags" | "daily_summary") {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch("/api/ai/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, entryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "失敗しました");
        return;
      }
      setMsg("完了しました");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function genImage() {
    const prompt = window.prompt("画像を生成するためのプロンプト（日本語）", "今日の空気感を写真風で");
    if (prompt === null) return;
    setBusy("img");
    setMsg(null);
    try {
      const res = await fetch("/api/ai/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "失敗しました");
        return;
      }
      setMsg("画像を生成しました");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveLocation() {
    const lat = parseFloat(latIn);
    const lon = parseFloat(lonIn);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setMsg("緯度・経度は数値で入力してください");
      return;
    }
    setBusy("loc");
    setMsg(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lon }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      setMsg("位置を保存しました");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function useGeolocation() {
    if (!navigator.geolocation) {
      setMsg("この環境では位置情報が使えません");
      return;
    }
    setBusy("geo");
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatIn(String(pos.coords.latitude));
        setLonIn(String(pos.coords.longitude));
        setBusy(null);
        setMsg("現在地を入力欄に反映しました（保存は「位置を保存」）");
      },
      () => {
        setBusy(null);
        setMsg("位置情報の取得に失敗しました");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function fetchWeather() {
    setBusy("wx");
    setMsg(null);
    try {
      const lat = parseFloat(latIn);
      const lon = parseFloat(lonIn);
      const payload =
        !Number.isNaN(lat) && !Number.isNaN(lon) ? { latitude: lat, longitude: lon } : {};
      const res = await fetch(`/api/entries/${entryId}/weather`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        entry?: { weatherJson?: WeatherJson };
      };
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "天気の取得に失敗しました");
        return;
      }
      const src = data.entry?.weatherJson?.locationSource;
      if (src === "tokyo_fallback") {
        setMsg("天気を保存しました（エントリ位置なし・既定地点なしのため東京代表で取得）");
      } else if (src === "user_default") {
        setMsg("天気を保存しました（設定の既定地点で取得）");
      } else {
        setMsg("天気を保存しました（その日の午前・午後）");
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function indexMemory() {
    setBusy("mem");
    setMsg(null);
    try {
      const res = await fetch("/api/memory/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "インデックスに失敗しました");
        return;
      }
      setMsg("ベクトル検索用にインデックスしました");
    } finally {
      setBusy(null);
    }
  }

  async function loadCalendar() {
    setBusy("cal");
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/events");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data.error === "string" ? data.error : "失敗しました";
        const hint = typeof data.hint === "string" ? ` ${data.hint}` : "";
        setMsg(err + hint);
        return;
      }
      const n = Array.isArray(data.events) ? data.events.length : 0;
      setMsg(`直近30日の予定（未来）: ${n} 件`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">AI 操作</h2>
      <p className="mt-1 text-xs text-zinc-500">タイトル・タグ・日次要約は各ボタンで実行（上限あり）。</p>
      {msg && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("title")}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "title" ? "…" : "タイトル生成"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("tags")}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "tags" ? "…" : "タグ提案"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("daily_summary")}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "daily_summary" ? "…" : "日次要約"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void genImage()}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "img" ? "…" : "画像生成"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void loadCalendar()}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "cal" ? "…" : "予定を確認（30日）"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void indexMemory()}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {busy === "mem" ? "…" : "記憶インデックス"}
        </button>
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">天気・位置（Open-Meteo）</h3>
        <p className="mt-1 text-xs text-zinc-500">
          位置を保存すると、その日のその地点で午前・午後の天気を自動記録します。手動の「天気を取得」も同様です。エントリに位置がない場合は設定の既定地点、なければ東京代表地点を使います。
        </p>
        {wj?.kind === "am_pm" && wj.am && wj.pm ? (
          <WeatherAmPmDisplay
            am={wj.am}
            pm={wj.pm}
            date={wj.date}
            dataSource={wj.dataSource}
            locationNote={wj.locationNote}
          />
        ) : wj?.weatherLabel != null ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            最終取得: {wj.weatherLabel}
            {wj.temperature_2m != null ? ` / ${wj.temperature_2m}°C` : ""}
            {wj.period ? `（${wj.period}）` : ""}
            {wj.locationNote ? ` · ${wj.locationNote}` : ""}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-end gap-2">
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
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveLocation()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {busy === "loc" ? "…" : "位置を保存"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void useGeolocation()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {busy === "geo" ? "…" : "現在地"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void fetchWeather()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {busy === "wx" ? "…" : "天気を取得"}
          </button>
        </div>
      </div>
    </div>
  );
}
