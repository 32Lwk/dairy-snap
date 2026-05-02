/**
 * 雑学ネタ帳の「◯月の記念日・年中行事一覧」（各月カテゴリページ）を取得し、
 * 月日ごとの記念日名を `src/data/jp-anniversary-by-day.json` に書き出す。
 *
 * 各日の aMMDD.html は月によって 404 になるため使わない。
 *
 * Usage (from web/):
 *   node scripts/fetch-zatsuneta-anniversaries.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "jp-anniversary-by-day.json");

const DELAY_MS = Number(process.env.ZATSUNETA_FETCH_DELAY_MS || 600);
const UA =
  process.env.ZATSUNETA_USER_AGENT?.trim() ||
  "DailySnap/jp-anniversary-sync (private use; respectful crawl)";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * 月カテゴリ HTML から「N日：…」ブロックを抽出し、日付 → 記念日名配列。
 */
function parseMonthCategoryHtml(html, monthNum) {
  const byDay = {};
  const anchor = `${monthNum}月の記念日`;
  const idx = html.indexOf(anchor);
  const slice = idx >= 0 ? html.slice(idx) : html;

  const re = /(\d{1,2})日：([\s\S]*?)(?=\d{1,2}日：|<h3>|<div |<\/div>\s*<div id="side|<\/body>|$)/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    const dayNum = parseInt(m[1], 10);
    if (dayNum < 1 || dayNum > 31) continue;
    const chunk = m[2];
    const names = [];
    const are = /<a[^>]*>([^<]*?)<\/a>/g;
    let am;
    while ((am = are.exec(chunk)) !== null) {
      const t = decodeEntities(am[1].trim()).replace(/\s+/g, " ");
      if (t && !names.includes(t)) names.push(t);
    }
    byDay[dayNum] = names;
  }
  return byDay;
}

function daysInMonth(m) {
  const d = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d[m - 1];
}

async function main() {
  const byDay = {};
  const errors = [];

  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    const url = `https://zatsuneta.com/category/anniversary${mm}.html`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
      });
      if (!res.ok) {
        errors.push({ month: mm, status: res.status });
        for (let day = 1; day <= daysInMonth(month); day++) {
          byDay[`${mm}${String(day).padStart(2, "0")}`] = [];
        }
        await sleep(DELAY_MS);
        continue;
      }
      const html = await res.text();
      const parsed = parseMonthCategoryHtml(html, month);
      const dim = daysInMonth(month);
      for (let day = 1; day <= dim; day++) {
        const dd = String(day).padStart(2, "0");
        const key = `${mm}${dd}`;
        const list = parsed[day];
        byDay[key] = Array.isArray(list) ? list : [];
      }
    } catch (e) {
      errors.push({ month: mm, err: String(e).slice(0, 120) });
      for (let day = 1; day <= daysInMonth(month); day++) {
        byDay[`${mm}${String(day).padStart(2, "0")}`] = [];
      }
    }
    process.stderr.write(`\r[month ${month}/12] ${mm}   `);
    await sleep(DELAY_MS);
  }

  const payload = {
    _meta: {
      sourceHome: "https://zatsuneta.com/category/anniversary.html",
      generatedAt: new Date().toISOString(),
      fetchMode: "monthly_category_anniversaryMM.html",
      fetchDelayMs: DELAY_MS,
      noteJa:
        "各月カテゴリの「記念日・年中行事一覧」から抽出。商用・再配布の可否はサイト運営者への確認を推奨。",
    },
    byDay,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 0)}\n`, "utf8");
  process.stderr.write(`\nWrote ${OUT}\n`);

  const empty = Object.entries(byDay).filter(([, v]) => !v.length).length;
  process.stderr.write(`Days with zero items: ${empty} / ${Object.keys(byDay).length}\n`);

  if (errors.length) {
    fs.writeFileSync(
      path.join(ROOT, "src", "data", "jp-anniversary-by-day.fetch-errors.json"),
      JSON.stringify(errors, null, 2),
      "utf8",
    );
  } else {
    try {
      fs.unlinkSync(path.join(ROOT, "src", "data", "jp-anniversary-by-day.fetch-errors.json"));
    } catch {
      /* none */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
