/**
 * 西洋占星術（トロピカル）の星座名（日本語）
 * 入力は暦日 `YYYY-MM-DD` の日付部分のみを解釈
 */

function mdKey(month: number, day: number): number {
  return month * 100 + day;
}

/** `YYYY-MM-DD` から星座（日本語）。不正な日付は null */
export function westernZodiacJaFromYmd(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [ys, ms, ds] = ymd.split("-");
  const y = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(y, month - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }

  const k = mdKey(month, day);

  if (k >= mdKey(12, 22) || k <= mdKey(1, 19)) return "山羊座";
  if (k >= mdKey(1, 20) && k <= mdKey(2, 18)) return "水瓶座";
  if (k >= mdKey(2, 19) && k <= mdKey(3, 20)) return "魚座";
  if (k >= mdKey(3, 21) && k <= mdKey(4, 19)) return "牡羊座";
  if (k >= mdKey(4, 20) && k <= mdKey(5, 20)) return "牡牛座";
  if (k >= mdKey(5, 21) && k <= mdKey(6, 20)) return "双子座";
  if (k >= mdKey(6, 21) && k <= mdKey(7, 22)) return "蟹座";
  if (k >= mdKey(7, 23) && k <= mdKey(8, 22)) return "獅子座";
  if (k >= mdKey(8, 23) && k <= mdKey(9, 22)) return "乙女座";
  if (k >= mdKey(9, 23) && k <= mdKey(10, 22)) return "天秤座";
  if (k >= mdKey(10, 23) && k <= mdKey(11, 21)) return "蠍座";
  if (k >= mdKey(11, 22) && k <= mdKey(12, 21)) return "射手座";

  return null;
}
