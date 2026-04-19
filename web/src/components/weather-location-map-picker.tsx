"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
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

export function WeatherLocationMapPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  useEffect(() => {
    const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
    delete proto._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const hasPin =
    latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const centerLat = hasPin ? latitude! : TOKYO[0];
  const centerLng = hasPin ? longitude! : TOKYO[1];
  const fallbackZoom = hasPin ? 13 : 11;
  /** Avoid remounting on every drag; remount when toggling between「保存地点あり」and探索（東京）. */
  const mapKey = hasPin ? "pinned" : "explore-tokyo";

  return (
    <div className="relative z-0 h-56 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 md:h-64">
      <MapContainer
        key={mapKey}
        center={[centerLat, centerLng]}
        zoom={fallbackZoom}
        className="h-full w-full [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:bg-zinc-100 dark:[&_.leaflet-container]:bg-zinc-900"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
    </div>
  );
}
