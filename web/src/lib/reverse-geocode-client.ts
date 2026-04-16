/** Reverse geocode via app API (Nominatim). Requires an authenticated session. */
export async function reverseGeocodeClient(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(
    `/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { display?: string };
  return typeof data.display === "string" && data.display.trim() ? data.display.trim() : null;
}
