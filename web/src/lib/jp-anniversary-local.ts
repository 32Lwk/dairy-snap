/**
 * ローカルバンドルされた「今日は何の日」（記念日・キャンペーン日混在）。
 * データは `src/data/jp-anniversary-by-day.json`。
 * 再生成: `npm run data:jp-anniversaries`（各月 `anniversaryMM.html` から抽出）。
 */

import anniversaryData from "@/data/jp-anniversary-by-day.json";

type AnniversaryFile = {
  _meta?: { sourceHome?: string; generatedAt?: string; noteJa?: string };
  byDay: Record<string, string[]>;
};

const data = anniversaryData as AnniversaryFile;

const MAX_LINES_FOR_PROMPT = 12;

/** `YYYY-MM-DD` → 記念日名の配列（無ければ null） */
export function getJpAnniversaryNamesForYmd(entryDateYmd: string): string[] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entryDateYmd.trim());
  if (!m) return null;
  const key = `${m[2]}${m[3]}`;
  const list = data.byDay[key];
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.slice(0, MAX_LINES_FOR_PROMPT);
}

export function formatJpAnniversaryLocalSystemBlock(
  names: string[],
  entryDateYmd: string,
  opts?: { showUserFacingAttribution?: boolean },
): string {
  const lines = names.map((t, i) => `${i + 1}. ${t}`);
  const sourceNote =
    "（ローカル収録の「記念日・年中行事」一覧。断定せず雑学・会話の糸口として。出典: 雑学ネタ帳系データの再収録）";
  const attr =
    opts?.showUserFacingAttribution === true
      ? "オーケストレーター方針: トーンに合うときだけ、会話末尾に雑学ネタ帳（ https://zatsuneta.com/category/anniversary.html ）への短い帰属を添えてよい。列挙の羅列は避ける。"
      : "会話本文に長い帰属や URL の羅列は不要（内部参照のみ）。";
  return [
    "## 雑学・この日の記念日・行事（参考・ローカルデータ）",
    `対象エントリ日: ${entryDateYmd}。${sourceNote}`,
    attr,
    ...lines,
  ].join("\n");
}
