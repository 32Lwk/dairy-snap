import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";

type NominatimAddr = Record<string, string>;

function placeLineFromNominatim(addr: NominatimAddr | undefined, displayName: string): string {
  if (!addr) {
    return displayName
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
  }

  const pref = (addr.state || addr.province || addr.region || "").trim();
  const muni = (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.county ||
    addr.municipality ||
    addr.city_district ||
    addr.suburb ||
    ""
  ).trim();

  const parts = [pref, muni].filter(Boolean);
  const deduped = parts.length === 2 && parts[0] === parts[1] ? [parts[0]] : parts;
  const line = deduped.join(" ");
  if (line) return line;

  return displayName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "\u7def\u5ea6\u30fb\u7d4c\u5ea6\u304c\u4e0d\u6b63\u3067\u3059" }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("zoom", "12");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        process.env.GEOCODE_USER_AGENT?.trim() ||
        "DairySnap/1.0 (https://nominatim.openstreetmap.org/wiki/Usage_Policy)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "\u5730\u540d\u306e\u89e3\u6c7a\u306b\u5931\u6557\u3057\u307e\u3057\u305f" }, { status: 502 });
  }

  const body = (await res.json().catch(() => null)) as {
    address?: NominatimAddr;
    display_name?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "\u5730\u540d\u306e\u89e3\u6c7a\u306b\u5931\u6557\u3057\u307e\u3057\u305f" }, { status: 502 });
  }

  const displayName = typeof body.display_name === "string" ? body.display_name : "";
  const display = placeLineFromNominatim(body.address, displayName).trim() || displayName.trim();

  if (!display) {
    return NextResponse.json({ error: "\u5730\u540d\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f" }, { status: 404 });
  }

  return NextResponse.json({ display });
}
