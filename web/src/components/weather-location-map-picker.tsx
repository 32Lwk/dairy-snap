"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const TOKYO: [number, number] = [35.6762, 139.6503];

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function SyncView({ lat, lng, fallbackZoom }: { lat: number; lng: number; fallbackZoom: number }) {
  const map = useMap();
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (prevKey.current === key) return;
    prevKey.current = key;
    const z = map.getZoom();
    map.setView([lat, lng], z > 0 ? z : fallbackZoom);
  }, [lat, lng, fallbackZoom, map]);
  return null;
}

function MapReadyBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

function MapOverlayControls({
  map,
  onPick,
  defaultLat,
  defaultLng,
}: {
  map: L.Map | null;
  onPick: (lat: number, lng: number) => void;
  defaultLat: number;
  defaultLng: number;
}) {
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const mapReady = map !== null;

  const iconCls = "h-4 w-4";
  const btnBase =
    "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:opacity-60";
  const btnPrimary =
    "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";
  const btnGhost =
    "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900";

  function moveDefault() {
    setGeoError(null);
    if (!map) {
      setGeoError("地図を準備中です…少し待ってからもう一度お試しください。");
      return;
    }
    map.flyTo([defaultLat, defaultLng], Math.max(map.getZoom() || 0, 12), { animate: true, duration: 0.6 });
  }

  function markDefault() {
    setGeoError(null);
    map?.flyTo([defaultLat, defaultLng], Math.max(map.getZoom() || 0, 12), { animate: true, duration: 0.6 });
    onPick(defaultLat, defaultLng);
  }

  function markCurrent() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("この環境では位置情報が使えません。既定地点にマークできます。");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        map?.flyTo([la, lo], Math.max(map.getZoom() || 0, 13), { animate: true, duration: 0.6 });
        onPick(la, lo);
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        setGeoError("位置情報の取得に失敗しました。既定地点にマークできます。");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-[1100] flex max-w-[min(92%,22rem)] flex-col items-end gap-2">
      <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={markCurrent}
          disabled={geoBusy}
          className={`${btnBase} ${btnPrimary}`}
          aria-label="現在地をマーク"
          title="現在地をマーク"
        >
          {geoBusy ? (
            <svg viewBox="0 0 24 24" className={iconCls} aria-hidden>
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className={iconCls} aria-hidden>
              <path
                d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
          <span className="sr-only">{geoBusy ? "取得中…" : "現在地をマーク"}</span>
        </button>
        <button
          type="button"
          onClick={moveDefault}
          className={`${btnBase} ${btnGhost}`}
          aria-label="既定地点に移動"
          title="既定地点に移動"
        >
          <svg viewBox="0 0 24 24" className={iconCls} aria-hidden>
            <path
              d="M12 2v4M12 18v4M2 12h4M18 12h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="sr-only">既定地点に移動</span>
        </button>
        <button
          type="button"
          onClick={markDefault}
          className={`${btnBase} ${btnGhost}`}
          aria-label="既定地点にマーク"
          title="既定地点にマーク"
        >
          <svg viewBox="0 0 24 24" className={iconCls} aria-hidden>
            <path
              d="M12 21s6-6.2 6-10.5A6 6 0 1 0 6 10.5C6 14.8 12 21 12 21Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="M12 7.5v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M9 10.5h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">既定地点にマーク</span>
        </button>
      </div>
      {geoError ? (
        <div className="pointer-events-auto rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-[11px] leading-snug text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {geoError}
        </div>
      ) : null}
    </div>
  );
}

export function WeatherLocationMapPicker({
  latitude,
  longitude,
  savedLatitude,
  savedLongitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  savedLatitude?: number | null;
  savedLongitude?: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const [shouldLoadMap, setShouldLoadMap] = useState(() => {
    if (typeof navigator === "undefined") return true;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (!connection) return true;
    return !(
      connection.saveData ||
      connection.effectiveType === "slow-2g" ||
      connection.effectiveType === "2g"
    );
  });

  useEffect(() => {
    const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
    delete proto._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const [map, setMap] = useState<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map) return;
    function onFlyTo(ev: Event) {
      const e = ev as CustomEvent<{ lat: number; lng: number; zoom?: number }>;
      const lat = e.detail?.lat;
      const lng = e.detail?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      const z = typeof e.detail?.zoom === "number" && Number.isFinite(e.detail.zoom) ? e.detail.zoom : Math.max(map.getZoom() || 0, 13);
      map.flyTo([lat, lng], z, { animate: true, duration: 0.6 });
    }
    window.addEventListener("daily-snap:weather-map:flyto", onFlyTo as EventListener);
    return () => window.removeEventListener("daily-snap:weather-map:flyto", onFlyTo as EventListener);
  }, [map]);

  const hasPin =
    latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const centerLat = hasPin ? latitude! : TOKYO[0];
  const centerLng = hasPin ? longitude! : TOKYO[1];
  const fallbackZoom = hasPin ? 13 : 11;
  const hasSaved =
    savedLatitude != null &&
    savedLongitude != null &&
    Number.isFinite(savedLatitude) &&
    Number.isFinite(savedLongitude);
  const defaultLat = hasSaved ? savedLatitude! : TOKYO[0];
  const defaultLng = hasSaved ? savedLongitude! : TOKYO[1];

  useEffect(() => {
    if (!map) return;
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    let t1: ReturnType<typeof setTimeout> | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      map.invalidateSize({ pan: false });
    };

    // 初期表示直後に2回（レイアウト確定/フォント反映後）補正
    raf = requestAnimationFrame(invalidate);
    t1 = setTimeout(invalidate, 0);
    t2 = setTimeout(invalidate, 120);

    const ro = new ResizeObserver(() => {
      // 連続発火で重くならないよう rAF へ寄せる
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(invalidate);
    });
    ro.observe(el);

    function onWinResize() {
      invalidate();
    }
    window.addEventListener("resize", onWinResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      cancelAnimationFrame(raf);
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [map]);

  if (!shouldLoadMap) {
    return (
      <div className="relative z-0 flex w-full min-h-56 aspect-[16/9] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 md:min-h-64">
        <p>低速回線（データ節約）を検出したため、地図の自動読み込みを停止しています。</p>
        <button
          type="button"
          onClick={() => setShouldLoadMap(true)}
          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          地図を読み込む
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative z-0 w-full min-h-56 aspect-[16/9] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 md:min-h-64"
    >
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={fallbackZoom}
        className="h-full w-full [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:bg-zinc-100 dark:[&_.leaflet-container]:bg-zinc-900"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapReadyBridge onReady={setMap} />
        <SyncView lat={centerLat} lng={centerLng} fallbackZoom={fallbackZoom} />
        <MapClickHandler onPick={onPick} />
        {hasPin ? (
          <Marker
            position={[latitude!, longitude!]}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as L.Marker;
                const p = m.getLatLng();
                onPick(p.lat, p.lng);
              },
            }}
          />
        ) : null}
      </MapContainer>
      <MapOverlayControls map={map} onPick={onPick} defaultLat={defaultLat} defaultLng={defaultLng} />
    </div>
  );
}
