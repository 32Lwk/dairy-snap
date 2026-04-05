/**
 * 文部科学省 学校基本調査 CSV（3ファイル）から検索用 JSON を生成する。
 * 対象: 中学(C1)・高校(D1)・大学(F1)・短大(F2)・高専(G1)。本校のみ・廃止済みは除外。
 *
 * 実行: node scripts/build-schools-index.mjs
 */
import fs from "fs";
import iconv from "iconv-lite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const CSV_FILES = [
  "date/school/20251226-mxt_chousa01-000011635_2.csv",
  "date/school/20251226-mxt_chousa01-000011635_4.csv",
  "date/school/20251226-mxt_chousa01-000011635_6.csv",
];

const PREF_NAMES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const KIND_PREFIXES = ["C1(", "D1(", "F1(", "F2(", "G1("];

function prefectureFromCol(col2) {
  const m = String(col2).match(/^(\d+)\(/);
  if (!m) return "";
  const n = Number.parseInt(m[1], 10);
  if (n < 1 || n > 47) return "";
  return PREF_NAMES[n - 1];
}

function parseRow(cols) {
  if (cols.length < 10) return null;
  const kind = cols[1] ?? "";
  if (!KIND_PREFIXES.some((p) => kind.startsWith(p))) return null;
  const branch = cols[4] ?? "";
  if (!branch.startsWith("1(")) return null;
  const closed = (cols[9] ?? "").trim();
  if (closed.length > 0) return null;

  const prefecture = prefectureFromCol(cols[2]);
  if (!prefecture) return null;

  const id = cols[0]?.trim();
  const name = cols[5]?.trim();
  const address = cols[6]?.trim() ?? "";
  if (!id || !name) return null;

  return { id, name, prefecture, address, kind: kind.split("(")[0] || kind };
}

function parseCsvLine(line) {
  const cols = line.split(",");
  return parseRow(cols);
}

function main() {
  const seen = new Set();
  const out = [];

  for (const rel of CSV_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) {
      console.error("missing:", fp);
      process.exit(1);
    }
    const buf = fs.readFileSync(fp);
    const text = iconv.decode(buf, "cp932");
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const row = parseCsvLine(line);
      if (!row) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }

  out.sort((a, b) => {
    const p = a.prefecture.localeCompare(b.prefecture, "ja");
    if (p !== 0) return p;
    return a.name.localeCompare(b.name, "ja");
  });

  /** 都道府県ごとの行インデックス（検索時に全件走査しない） */
  const byPrefecture = {};
  /** 都道府県×種別の行インデックス（さらに候補生成を軽くする） */
  const byPrefectureKind = {};
  /** 種別のみ（全国・県未選択時の閲覧・1文字検索の走査範囲を絞る） */
  const byKind = {};
  for (let i = 0; i < out.length; i++) {
    const p = out[i].prefecture;
    if (!byPrefecture[p]) byPrefecture[p] = [];
    byPrefecture[p].push(i);

    const k = out[i].kind;
    const key = `${p}|${k}`;
    if (!byPrefectureKind[key]) byPrefectureKind[key] = [];
    byPrefectureKind[key].push(i);

    if (!byKind[k]) byKind[k] = [];
    byKind[k].push(i);
  }

  const bundle = { rows: out, byPrefecture, byPrefectureKind, byKind };
  const outPath = path.join(ROOT, "src/lib/schools-data.json");
  fs.writeFileSync(outPath, JSON.stringify(bundle), "utf8");
  console.log("wrote", out.length, "schools + pref index ->", outPath);
}

main();
