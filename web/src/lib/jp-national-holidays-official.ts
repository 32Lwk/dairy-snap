import raw from "@/data/jp-national-holidays-official.json";
import { nationalHolidayTitleMatches } from "@/lib/jp-holiday-title-match";

type OfficialPayload = {
  generatedAt: string;
  source?: string;
  sourceNote?: string;
  holidays: Record<string, string>;
};

const payload = raw as OfficialPayload;
const holidays: Record<string, string> = payload.holidays ?? {};

/** 内閣府 CSV 由来のメタ（監査・デバッグ用。プロンプト本文には載せない） */
export function getOfficialNationalHolidayDatasetMeta(): Pick<OfficialPayload, "generatedAt" | "source" | "sourceNote"> {
  return {
    generatedAt: payload.generatedAt,
    source: payload.source,
    sourceNote: payload.sourceNote,
  };
}

/**
 * 指定暦日（Asia/Tokyo YYYY-MM-DD）の公式祝日・休日ラベル（内閣府 syukujitsu.csv）。
 * 振替の「休日」や法令上の臨時休日表記も CSV に含まれる。
 */
export function getOfficialNationalHolidayNameJa(ymd: string): string | null {
  const t = (ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const n = holidays[t];
  return typeof n === "string" && n.trim() ? n.trim() : null;
}

let _strictTitleNames: Set<string> | undefined;

/**
 * タイトルが「国民の祝日の名称」に一致するか検査するための名称集合。
 * 「休日」だけはユーザーが自由に使うことが多いため **含めない**（誤除去防止）。
 */
export function getStrictNationalHolidayCatalogNames(): Set<string> {
  if (_strictTitleNames) return _strictTitleNames;
  const s = new Set<string>();
  for (const v of Object.values(holidays)) {
    const x = (v ?? "").trim();
    if (!x || x === "休日") continue;
    s.add(x);
  }
  _strictTitleNames = s;
  return s;
}

/**
 * 終日予定のタイトルが **名称カタログ上の祝日名** に見えるが、
 * `entryDateYmd` 上の公式ラベルと一致しない → カレンダーゴースト／誤同期の疑いが高い。
 */
export function calendarTitleClaimsWrongCatalogNationalHoliday(entryDateYmd: string, titleRaw: string): boolean {
  const officialToday = getOfficialNationalHolidayNameJa(entryDateYmd);
  const title = (titleRaw ?? "").trim();
  if (!title) return false;
  for (const name of getStrictNationalHolidayCatalogNames()) {
    if (!nationalHolidayTitleMatches(title, name)) continue;
    if (officialToday && nationalHolidayTitleMatches(title, officialToday)) return false;
    return true;
  }
  return false;
}

/**
 * `calendarTitleClaimsWrongCatalogNationalHoliday` の拡張版。
 * - 公式（内閣府CSV）に加えて、フォールバック（例: japanese-holidays）でも当日ラベルを許容する。
 * - 公式JSONが古い/欠けている場合でも、当日が None なのに祝日名っぽいタイトルを通さない。
 */
export function calendarTitleClaimsWrongCatalogNationalHolidayWithTodayOverride(
  entryDateYmd: string,
  titleRaw: string,
  todayOverrideName: string | null | undefined,
): boolean {
  const officialToday = getOfficialNationalHolidayNameJa(entryDateYmd);
  const todayOverride = (todayOverrideName ?? "").trim();
  const today = officialToday ?? (todayOverride ? todayOverride : null);
  const title = (titleRaw ?? "").trim();
  if (!title) return false;
  for (const name of getStrictNationalHolidayCatalogNames()) {
    if (!nationalHolidayTitleMatches(title, name)) continue;
    if (today && nationalHolidayTitleMatches(title, today)) return false;
    return true;
  }
  return false;
}
