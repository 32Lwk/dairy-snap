/**
 * 趣味タグ中央マップに載せている URL の到達確認（任意・手動）。
 * - HEAD が 405/403/404 のときは GET を試す（配信 CDN によって HEAD が無効な場合がある）。
 * - データセンターからの取得拒否・TLS 差異で ERR になる公式サイトはある（ブラウザでは開ける）。その場合は手動で確認する。
 *
 * Usage (from web/): npm run verify-interest-urls
 */

const defaultUrls = await import("./src/lib/interest-official-urls-default.ts");
const portalUrls = await import("./src/lib/interest-sub-portal-urls.ts");

const DEFAULT_OFFICIAL_URLS_BY_PICK_ID: Record<string, string[]> =
  (defaultUrls as { DEFAULT_OFFICIAL_URLS_BY_PICK_ID?: Record<string, string[]> }).DEFAULT_OFFICIAL_URLS_BY_PICK_ID ??
  (defaultUrls as { default?: { DEFAULT_OFFICIAL_URLS_BY_PICK_ID: Record<string, string[]> } }).default!
    .DEFAULT_OFFICIAL_URLS_BY_PICK_ID;

const INTEREST_SUB_PORTAL_URL_BY_ID: Record<string, string> =
  (portalUrls as { INTEREST_SUB_PORTAL_URL_BY_ID?: Record<string, string> }).INTEREST_SUB_PORTAL_URL_BY_ID ??
  (portalUrls as { default?: { INTEREST_SUB_PORTAL_URL_BY_ID: Record<string, string> } }).default!
    .INTEREST_SUB_PORTAL_URL_BY_ID;

function collectUniqueUrls(): string[] {
  const s = new Set<string>();
  for (const arr of Object.values(DEFAULT_OFFICIAL_URLS_BY_PICK_ID)) {
    for (const u of arr) s.add(u.trim());
  }
  for (const u of Object.values(INTEREST_SUB_PORTAL_URL_BY_ID)) {
    s.add(u.trim());
  }
  return [...s].sort();
}

async function probe(url: string): Promise<{ ok: boolean; status: number; method: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  const tryReq = async (method: "HEAD" | "GET") => {
    const r = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "daily-snap-url-audit/1.0" },
    });
    return r.status;
  };
  try {
    let status = await tryReq("HEAD");
    let method = "HEAD";
    if (status === 405 || status === 403 || status === 404) {
      status = await tryReq("GET");
      method = "GET";
    }
    const ok = status >= 200 && status < 400;
    return { ok, status, method };
  } catch {
    return { ok: false, status: 0, method: "ERR" };
  } finally {
    clearTimeout(t);
  }
}

const urls = collectUniqueUrls();
console.log(`Probing ${urls.length} unique URLs…`);

const bad: string[] = [];
let i = 0;
for (const u of urls) {
  i += 1;
  const { ok, status, method } = await probe(u);
  const line = `[${i}/${urls.length}] ${status} ${method} ${u}`;
  if (!ok) {
    console.error(`FAIL ${line}`);
    bad.push(u);
  } else {
    console.log(`ok  ${line}`);
  }
}

if (bad.length) {
  console.error(`\n${bad.length} URL(s) failed or timed out:`);
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}

console.log("\nAll URLs responded OK (2xx/3xx or acceptable HEAD).");
