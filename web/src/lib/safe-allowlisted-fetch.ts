/**
 * allowlist 内 URL のみ GET。SSRF 緩和（プライベート IP は未チェック—本番は VPC / プロキシ推奨）。
 */

import { createHash } from "node:crypto";
import { hobbyAllowlistedHosts } from "@/lib/news-allowlist";

const MAX_BYTES = 512_000;
const DEFAULT_TIMEOUT_MS = 8000;

export function normalizeUrlForFetch(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u;
  } catch {
    return null;
  }
}

export function urlHostAllowed(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  return hobbyAllowlistedHosts().has(host);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export type AllowlistedFetchResult = {
  ok: boolean;
  status: number;
  excerpt: string;
  urlNorm: string;
  urlHash: string;
};

function stripToExcerpt(html: string, maxLen: number): string {
  const noTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return noTags.length <= maxLen ? noTags : `${noTags.slice(0, maxLen)}…`;
}

export async function fetchAllowlistedUrlExcerpt(params: {
  url: string;
  timeoutMs?: number;
}): Promise<AllowlistedFetchResult> {
  const u = normalizeUrlForFetch(params.url);
  if (!u) {
    return {
      ok: false,
      status: 0,
      excerpt: "",
      urlNorm: "",
      urlHash: "",
    };
  }
  if (!urlHostAllowed(u)) {
    return {
      ok: false,
      status: 0,
      excerpt: "",
      urlNorm: u.toString(),
      urlHash: sha256Hex(u.toString()),
    };
  }

  const urlNorm = u.toString();
  const urlHash = sha256Hex(urlNorm);
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(urlNorm, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": process.env.HOBBY_FETCH_USER_AGENT?.trim() || "DailySnap/1.0 (hobby; contact: app)",
      },
    });
    const buf = await readResponseWithCap(res, MAX_BYTES);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const excerpt = stripToExcerpt(text, 2400);
    return {
      ok: res.ok,
      status: res.status,
      excerpt,
      urlNorm,
      urlHash,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      excerpt: "",
      urlNorm,
      urlHash,
    };
  } finally {
    clearTimeout(to);
  }
}

async function readResponseWithCap(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, out.length - off);
    out.set(c.subarray(0, take), off);
    off += take;
    if (off >= out.length) break;
  }
  return out;
}
