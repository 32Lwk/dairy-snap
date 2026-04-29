"use client";

import { PlaceCoordsLine } from "@/components/place-coords-line";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { WeatherAmPmDisplay } from "@/components/weather-am-pm-display";
import { reverseGeocodeClient } from "@/lib/reverse-geocode-client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

const WeatherLocationMapPicker = dynamic(
  () =>
    import("@/components/weather-location-map-picker").then((m) => ({
      default: m.WeatherLocationMapPicker,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        {"\u5730\u56f3\u3092\u8aad\u307f\u8fbc\u307f\u4e2d\u2026"}
      </div>
    ),
  },
);

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
  /** 天気・位置セクション（`border-t`）の直前に差し込む（例: プルチック主感情） */
  prependWeather,
}: {
  entryId: string;
  latitude: number | null;
  longitude: number | null;
  weatherJson: unknown;
  prependWeather?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [latIn, setLatIn] = useState(latitude != null ? String(latitude) : "");
  const [lonIn, setLonIn] = useState(longitude != null ? String(longitude) : "");
  const [placeLine, setPlaceLine] = useState<string | null>(null);
  const [locationMapOpen, setLocationMapOpen] = useState(false);
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLon, setDraftLon] = useState<number | null>(null);
  const [draftGeoBusy, setDraftGeoBusy] = useState(false);
  const autoWeatherDoneForEntryRef = useRef<string | null>(null);

  const wj = weatherJson as WeatherJson | null;

  const openLocationMap = useCallback(() => {
    let la: number | null = null;
    let lo: number | null = null;
    if (latitude != null && Number.isFinite(latitude)) {
      la = latitude;
    } else {
      const p = parseFloat(latIn);
      if (Number.isFinite(p)) la = p;
    }
    if (longitude != null && Number.isFinite(longitude)) {
      lo = longitude;
    } else {
      const p = parseFloat(lonIn);
      if (Number.isFinite(p)) lo = p;
    }
    setDraftLat(la);
    setDraftLon(lo);
    setLocationMapOpen(true);
  }, [latIn, lonIn, latitude, longitude]);

  const applyDraftLocation = useCallback(() => {
    if (draftLat == null || draftLon == null || !Number.isFinite(draftLat) || !Number.isFinite(draftLon)) {
      setMsg("地図をタップするか、現在地を取得して位置を指定してください");
      return;
    }
    setLatIn(String(draftLat));
    setLonIn(String(draftLon));
    setPlaceLine(null);
    void reverseGeocodeClient(draftLat, draftLon).then(setPlaceLine);
    setLocationMapOpen(false);
    setMsg(null);
  }, [draftLat, draftLon]);

  function requestDraftGeolocation() {
    if (!navigator.geolocation) {
      setMsg("この環境では位置情報が使えません");
      return;
    }
    setDraftGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraftLat(pos.coords.latitude);
        setDraftLon(pos.coords.longitude);
        setDraftGeoBusy(false);
      },
      () => {
        setDraftGeoBusy(false);
        setMsg("位置情報の取得に失敗しました");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  useEffect(() => {
    setLatIn(latitude != null ? String(latitude) : "");
    setLonIn(longitude != null ? String(longitude) : "");
  }, [latitude, longitude]);

  useEffect(() => {
    if (latitude == null || longitude == null) {
      setPlaceLine(null);
      return;
    }
    let cancelled = false;
    void reverseGeocodeClient(latitude, longitude).then((line) => {
      if (!cancelled) setPlaceLine(line);
    });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  async function saveLocation() {
    const lat = parseFloat(latIn);
    const lon = parseFloat(lonIn);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setMsg("地図で指定するか、現在地を取得してください");
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

  async function requestGeolocation() {
    if (!navigator.geolocation) {
      setMsg("この環境では位置情報が使えません");
      return;
    }
    setBusy("geo");
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setLatIn(String(la));
        setLonIn(String(lo));
        setBusy(null);
        void reverseGeocodeClient(la, lo).then(setPlaceLine);
        setMsg("現在地を反映しました（「位置を保存」で確定）");
      },
      () => {
        setBusy(null);
        setMsg("位置情報の取得に失敗しました");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const fetchWeather = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      setBusy("wx");
      if (!silent) setMsg(null);
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
          if (!silent) {
            setMsg(typeof data.error === "string" ? data.error : "天気の取得に失敗しました");
          }
          return;
        }
        if (!silent) {
          const src = data.entry?.weatherJson?.locationSource;
          if (src === "tokyo_fallback") {
            setMsg("天気を保存しました（エントリ位置なし・既定地点なしのため東京代表で取得）");
          } else if (src === "user_default") {
            setMsg("天気を保存しました（設定の既定地点で取得）");
          } else {
            setMsg("天気を保存しました（その日の午前・午後）");
          }
        }
        router.refresh();
      } finally {
        setBusy(null);
      }
    },
    [entryId, latIn, lonIn, router],
  );

  useEffect(() => {
    if (autoWeatherDoneForEntryRef.current === entryId) return;
    const hasAmPm = wj?.kind === "am_pm" && wj.am && wj.pm;
    if (hasAmPm) {
      autoWeatherDoneForEntryRef.current = entryId;
      return;
    }
    autoWeatherDoneForEntryRef.current = entryId;
    void fetchWeather({ silent: true });
  }, [entryId, wj, fetchWeather]);

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      {msg ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
      {prependWeather ? <div className="mt-4">{prependWeather}</div> : null}

      <div className={!msg && !prependWeather ? "mt-0" : "mt-6"}>
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
        {(() => {
          const la = parseFloat(latIn);
          const lo = parseFloat(lonIn);
          const ok = !Number.isNaN(la) && !Number.isNaN(lo);
          return (
            <PlaceCoordsLine
              placeLine={placeLine}
              latitude={ok ? la : NaN}
              longitude={ok ? lo : NaN}
              showCoordinates={false}
            />
          );
        })()}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => openLocationMap()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {"地図で指定"}
          </button>
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
            onClick={() => void requestGeolocation()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {busy === "geo" ? "…" : "現在地"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void fetchWeather({ silent: false })}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {busy === "wx" ? "…" : "天気を取得"}
          </button>
        </div>
      </div>

      <ResponsiveDialog
        open={locationMapOpen}
        onClose={() => setLocationMapOpen(false)}
        labelledBy="entry-location-map-title"
        dialogId="entry-location-map-dialog"
        zClass="z-[60]"
        presentation="island"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-zinc-800 md:pt-4">
          <h2 id="entry-location-map-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {"位置を地図で指定"}
          </h2>
          <button
            type="button"
            onClick={() => setLocationMapOpen(false)}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {"\u9589\u3058\u308b"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <p className="text-xs text-zinc-500">
            {"\u5730\u56f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u304b\u3001\u30d4\u30f3\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u5730\u70b9\u3092\u9078\u3073\u307e\u3059\uff08OpenStreetMap\uff09\u3002"}
          </p>
          <div className="mt-3">
            <WeatherLocationMapPicker
              latitude={draftLat}
              longitude={draftLon}
              onPick={(lat, lng) => {
                setDraftLat(lat);
                setDraftLon(lng);
              }}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={draftGeoBusy}
              onClick={() => requestDraftGeolocation()}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
            >
              {draftGeoBusy ? "…" : "現在地"}
            </button>
            <button
              type="button"
              onClick={() => setLocationMapOpen(false)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => applyDraftLocation()}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              この位置を適用
            </button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
