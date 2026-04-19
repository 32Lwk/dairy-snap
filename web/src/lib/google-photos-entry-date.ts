import { formatYmdTokyo } from "@/lib/time/tokyo";

/** Google メタデータの撮影時刻が、日記のエントリ日（東京の暦日）と一致するか */
export function mediaCreationMatchesEntryYmd(creationTime: Date | null, entryDateYmd: string): boolean {
  if (!creationTime || Number.isNaN(creationTime.getTime())) return false;
  return formatYmdTokyo(creationTime) === entryDateYmd;
}
