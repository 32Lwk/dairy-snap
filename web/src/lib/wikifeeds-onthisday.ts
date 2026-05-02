/**
 * Wikimedia Wikifeeds: onthisday/selected (ja 404 → en)
 * @see https://www.mediawiki.org/wiki/Wikifeeds_API
 */

import { scheduleAppLog, AppLogScope } from "@/lib/server/app-log";

const BASE = "https://api.wikimedia.org/feed/v1/wikipedia";

type CacheEntry = { text: string; at: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 800;

function cacheKey(wikiLang: string, mm: string, dd: string): string {
  return `${wikiLang}:${mm}:${dd}`;
}

function userAgent(): string {
  const u = process.env.WIKIFEEDS_USER_AGENT?.trim();
  if (u) return u;
  return "DailySnap/1.0 (https://github.com/; contact: app)";
}

export type WikifeedsOnThisDayResult = {
  wikiLangUsed: string;
  lines: string[];
  rawTitles: string[];
};

function parseSelectedTitles(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const sel = (json as { selected?: unknown }).selected;
  if (!Array.isArray(sel)) return [];
  const titles: string[] = [];
  for (const item of sel) {
    if (!item || typeof item !== "object") continue;
    const t = (item as { text?: string; title?: string; pages?: { titles?: { normalized?: string } }[] })
      .text;
    const title =
      typeof t === "string" && t.trim()
        ? t.trim()
        : typeof (item as { title?: string }).title === "string"
          ? (item as { title: string }).title.trim()
          : "";
    if (title) titles.push(title);
  }
  return titles;
}

async function fetchJson(
  wikiLang: string,
  mm: string,
  dd: string,
  signal: AbortSignal,
): Promise<unknown | null> {
  const url = `${BASE}/${wikiLang}/onthisday/selected/${mm}/${dd}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": userAgent() },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    scheduleAppLog(AppLogScope.wikifeeds, "warn", "wikifeeds_http_error", {
      status: res.status,
      wikiLang,
      mm,
      dd,
    });
    return null;
  }
  try {
    return await res.json();
  } catch {
    scheduleAppLog(AppLogScope.wikifeeds, "warn", "wikifeeds_parse_error", { wikiLang, mm, dd });
    return null;
  }
}

/**
 * wikiLang: まず試す言語（通常 ja）。404 なら en。
 */
export async function fetchOnThisDaySelectedForPrompt(params: {
  wikiLangPrimary: string;
  month: string;
  day: string;
  timeoutMs?: number;
  correlationId?: string;
}): Promise<WikifeedsOnThisDayResult | null> {
  const { wikiLangPrimary, month, day } = params;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const tryLangs = wikiLangPrimary === "ja" ? ["ja", "en"] : [wikiLangPrimary, "en"];

  for (const lang of tryLangs) {
    const ck = cacheKey(lang, mm, dd);
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < TTL_MS) {
      if (!hit.text) return null;
      return {
        wikiLangUsed: lang,
        lines: hit.text.split("\n").filter(Boolean),
        rawTitles: [],
      };
    }
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let used: string | null = null;
  let titles: string[] = [];

  try {
    for (const lang of tryLangs) {
      const json = await fetchJson(lang, mm, dd, controller.signal);
      if (json == null) continue;
      const parsed = parseSelectedTitles(json);
      if (parsed.length === 0) continue;
      titles = parsed;
      used = lang;
      break;
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    scheduleAppLog(AppLogScope.wikifeeds, aborted ? "info" : "warn", "wikifeeds_fetch_error", {
      reason: aborted ? "timeout" : String(e).slice(0, 120),
      correlationId: params.correlationId,
    });
    clearTimeout(t);
    return null;
  } finally {
    clearTimeout(t);
  }

  if (!used || titles.length === 0) return null;

  const max = 4;
  const slice = titles.slice(0, max);

  const lines = slice.map((t, i) => `${i + 1}. ${t}`);
  const block = lines.join("\n");
  const ck = cacheKey(used, mm, dd);
  cache.set(ck, { text: block, at: Date.now() });

  scheduleAppLog(AppLogScope.wikifeeds, "debug", "wikifeeds_ok", {
    wikiLang: used,
    mm,
    dd,
    titleCount: slice.length,
    correlationId: params.correlationId,
  });

  return { wikiLangUsed: used, lines, rawTitles: slice };
}

export function formatOnThisDaySystemBlock(
  result: WikifeedsOnThisDayResult,
  entryDateYmd: string,
  opts?: { showUserFacingAttribution?: boolean },
): string {
  const sourceNote =
    result.wikiLangUsed === "en"
      ? "（英語版 Wikipedia / On this day の見出し要約用。断定せず、雑学として触れてよい）"
      : "（Wikipedia / On this day。断定せず雑学として）";
  const attr =
    opts?.showUserFacingAttribution === true
      ? "オーケストレーター方針: トーンに合うときだけ、会話末尾に Wikipedia / Wikimedia への短い帰属（リンク可）を添えてよい。無理な列挙や長文は避ける。"
      : "会話本文に出典URLや長い帰属は不要（内部参照のみ）。";
  return [
    "## 雑学・歴史上のこの日（参考・未検証）",
    `対象エントリ日の月日に基づく参照: ${entryDateYmd}。${sourceNote}`,
    attr,
    ...result.lines,
  ].join("\n");
}
