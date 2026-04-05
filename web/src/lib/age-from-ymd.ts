/** ローカル日付の YYYY-MM-DD（`<input type="date" max>` など用） */
export function localYmdToday(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `type="date"` の値や、年に余分な桁が混入した文字列を YYYY-MM-DD に正規化する。
 * 年は先頭4桁に切り詰め、暦として無効な日付は "" を返す。
 */
export function sanitizeHtmlDateYmd(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const m = /^(\d+)-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return "";
  let y = m[1];
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  if (y.length > 4) y = y.slice(0, 4);
  if (y.length !== 4) return "";
  const yi = Number(y);
  const mi = Number(mo);
  const di = Number(d);
  if (yi < 1 || yi > 9999 || mi < 1 || mi > 12 || di < 1 || di > 31) return "";
  const dt = new Date(yi, mi - 1, di);
  if (dt.getFullYear() !== yi || dt.getMonth() !== mi - 1 || dt.getDate() !== di) return "";
  return `${y}-${mo}-${d}`;
}

/** 今日基準の満年齢（誕生日がまだ来ていなければ1減） */
export function ageYearsFromYmd(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [ys, ms, ds] = ymd.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const birth = new Date(y, m - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== m - 1 || birth.getDate() !== d) return null;

  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() > m - 1 ||
    (today.getMonth() === m - 1 && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
