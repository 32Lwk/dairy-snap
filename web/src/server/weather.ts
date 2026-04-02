import { formatYmdTokyo } from "@/lib/time/tokyo";

/** Open-Meteo（無料・キー不要）現在の気象スナップショット */

const WMO_LABEL: Record<number, string> = {
  0: "快晴",
  1: "おおむね晴れ",
  2: "ところにより曇り",
  3: "曇り",
  45: "霧",
  48: "霧",
  51: "弱い霧雨",
  53: "霧雨",
  55: "強い霧雨",
  61: "弱い雨",
  63: "雨",
  65: "強い雨",
  71: "弱い雪",
  73: "雪",
  75: "強い雪",
  80: "にわか雨",
  81: "にわか雨",
  82: "激しいにわか雨",
  95: "雷雨",
  96: "雷雨（雹）",
  99: "雷雨（強い雹）",
};

export type OpenMeteoCurrent = {
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;
  period: "AM" | "PM";
  temperatureC: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  raw: Record<string, unknown>;
};

export function weatherLabelForCode(code: number | null): string {
  if (code == null) return "不明";
  return WMO_LABEL[code] ?? `コード${code}`;
}

function labelForCode(code: number | null): string {
  return weatherLabelForCode(code);
}

/** 東京基準の午前/午後（サーバーTZに依存しない） */
function periodFromIsoInTokyo(isoTime: string): "AM" | "PM" {
  const d = new Date(isoTime);
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );
  return h < 12 ? "AM" : "PM";
}

export async function fetchOpenMeteoCurrent(
  latitude: number,
  longitude: number,
): Promise<OpenMeteoCurrent> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("current", "temperature_2m,weather_code");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    latitude?: number;
    longitude?: number;
    timezone?: string;
    current?: {
      time?: string;
      temperature_2m?: number;
      weather_code?: number;
    };
  };

  const cur = data.current;
  const isoTime = cur?.time ?? new Date().toISOString();
  const code = cur?.weather_code ?? null;
  const temp = cur?.temperature_2m ?? null;

  return {
    latitude: data.latitude ?? latitude,
    longitude: data.longitude ?? longitude,
    timezone: data.timezone ?? "Asia/Tokyo",
    fetchedAt: new Date().toISOString(),
    period: periodFromIsoInTokyo(isoTime),
    temperatureC: temp,
    weatherCode: code,
    weatherLabel: labelForCode(code),
    raw: {
      time: isoTime,
      temperature_2m: temp,
      weather_code: code,
    },
  };
}

/** 指定日（Asia/Tokyo の calendar day）の午前・午後代表（9時・15時付近）の気象 */
export type DayAmPmSnapshot = {
  dateYmd: string;
  am: {
    time: string;
    temperatureC: number | null;
    weatherCode: number | null;
    weatherLabel: string;
  };
  pm: {
    time: string;
    temperatureC: number | null;
    weatherCode: number | null;
    weatherLabel: string;
  };
  fetchedAt: string;
  /** 過去日は Archive API、当日〜未来に近い日は Forecast API */
  dataSource: "forecast" | "archive";
};

function findHourIndex(times: string[], targetHour: number): number {
  const suffix = `T${String(targetHour).padStart(2, "0")}:00`;
  const exact = times.findIndex((t) => t.includes(suffix));
  if (exact >= 0) return exact;
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = new Date(times[i]);
    const h = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tokyo",
        hour: "numeric",
        hour12: false,
      }).format(d),
    );
    const score = Math.abs(h - targetHour);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

type HourlyPayload = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

function buildDayAmPmFromHourly(
  data: HourlyPayload,
  dateYmd: string,
  dataSource: "forecast" | "archive",
): DayAmPmSnapshot {
  const times = data.hourly?.time ?? [];
  const temps = data.hourly?.temperature_2m ?? [];
  const codes = data.hourly?.weather_code ?? [];
  if (times.length === 0) {
    throw new Error("Open-Meteo: hourly データがありません");
  }

  const iAm = findHourIndex(times, 9);
  const iPm = findHourIndex(times, 15);

  const pick = (i: number) => {
    const t = times[i] ?? "";
    const temp = temps[i] ?? null;
    const code = codes[i] ?? null;
    return {
      time: t,
      temperatureC: temp,
      weatherCode: code,
      weatherLabel: weatherLabelForCode(code),
    };
  };

  return {
    dateYmd,
    am: pick(iAm),
    pm: pick(iPm),
    fetchedAt: new Date().toISOString(),
    dataSource,
  };
}

async function fetchOpenMeteoHourlyForecast(
  latitude: number,
  longitude: number,
  dateYmd: string,
): Promise<HourlyPayload> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("hourly", "temperature_2m,weather_code");
  url.searchParams.set("start_date", dateYmd);
  url.searchParams.set("end_date", dateYmd);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Open-Meteo Forecast HTTP ${res.status}`);
  }
  return (await res.json()) as HourlyPayload;
}

async function fetchOpenMeteoHourlyArchive(
  latitude: number,
  longitude: number,
  dateYmd: string,
): Promise<HourlyPayload> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("hourly", "temperature_2m,weather_code");
  url.searchParams.set("start_date", dateYmd);
  url.searchParams.set("end_date", dateYmd);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Open-Meteo Archive HTTP ${res.status}`);
  }
  return (await res.json()) as HourlyPayload;
}

/**
 * 東京の暦日で「今日より前」なら Archive API、当日以降は Forecast API。
 */
export async function fetchOpenMeteoDayAmPm(
  latitude: number,
  longitude: number,
  dateYmd: string,
): Promise<DayAmPmSnapshot> {
  const todayTokyo = formatYmdTokyo(new Date());

  if (dateYmd < todayTokyo) {
    const data = await fetchOpenMeteoHourlyArchive(latitude, longitude, dateYmd);
    return buildDayAmPmFromHourly(data, dateYmd, "archive");
  }

  try {
    const data = await fetchOpenMeteoHourlyForecast(latitude, longitude, dateYmd);
    const times = data.hourly?.time ?? [];
    if (times.length === 0) {
      throw new Error("empty hourly");
    }
    return buildDayAmPmFromHourly(data, dateYmd, "forecast");
  } catch {
    throw new Error("Open-Meteo: 予報データを取得できませんでした");
  }
}
