/**
 * 内閣府「国民の祝日について」公開の syukujitsu.csv から祝日マップを生成する。
 * @see https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
 *
 * CSV が取得できない環境では japanese-holidays で同形式のマップを生成（フォールバック）。
 * 本番運用では定期的に本スクリプトを実行し JSON を更新することを推奨。
 */
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const iconv = require("iconv-lite");
const JapaneseHolidays = require("japanese-holidays");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "src", "data", "jp-national-holidays-official.json");

const CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";

function parseCsvText(text) {
  const holidays = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const i = trimmed.indexOf(",");
    if (i === -1) continue;
    const datePart = trimmed.slice(0, i).trim();
    const name = trimmed.slice(i + 1).trim().replace(/^"|"$/g, "");
    const m = datePart.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m || !name) continue;
    const ymd = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    holidays[ymd] = name;
  }
  return holidays;
}

async function fetchCabinetOfficeCsv() {
  const res = await fetch(CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, "shift_jis");
}

function buildFromJapaneseHolidays(y0, y1) {
  const holidays = {};
  for (let y = y0; y <= y1; y++) {
    for (let month = 1; month <= 12; month++) {
      const dim = new Date(y, month, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const mm = String(month).padStart(2, "0");
        const dd = String(d).padStart(2, "0");
        const ymd = `${y}-${mm}-${dd}`;
        const jst = new Date(`${ymd}T12:00:00+09:00`);
        const h = JapaneseHolidays.isHolidayAt(jst);
        if (typeof h === "string" && h.trim()) holidays[ymd] = h.trim();
      }
    }
  }
  return holidays;
}

let source;
let holidays;
try {
  const text = await fetchCabinetOfficeCsv();
  holidays = parseCsvText(text);
  source = CSV_URL;
  if (Object.keys(holidays).length < 50) {
    throw new Error("CSV のパース結果が少なすぎます");
  }
} catch (e) {
  console.warn("[sync-jp-national-holidays] 内閣府 CSV を使えません。japanese-holidays でフォールバックします:", e?.message ?? e);
  holidays = buildFromJapaneseHolidays(2020, 2042);
  source = "japanese-holidays@npm (fallback; ネットワーク可能なら CSV を再取得してください)";
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourceNote:
    "正: 内閣府 syukujitsu.csv。取得失敗時は japanese-holidays による近似。運用では `npm run sync:jp-holidays` を定期実行し CSV を優先してください。",
  source,
  holidays,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log("wrote", outPath, Object.keys(holidays).length, "entries", "source:", source);
