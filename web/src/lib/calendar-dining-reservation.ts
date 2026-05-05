/**
 * Detect dining / bar / restaurant-style reservations so we don't mis-frame them as 就活・仕事中心.
 */

export type DiningReservationTextFields = {
  title?: string;
  description?: string;
  location?: string;
  eventSearchBlob?: string;
};

function norm(s: string): string {
  return s.normalize("NFKC").trim();
}

/** Short fields joined for keyword scan (bounded). */
function joinedHay(ev: DiningReservationTextFields): string {
  const parts = [ev.title, ev.description, ev.location, ev.eventSearchBlob].map((x) => norm(x ?? ""));
  return parts.filter(Boolean).join("\n").toLowerCase();
}

/**
 * True when the event reads like a restaurant/bar/cafe reservation rather than a generic "opaque company" slot.
 */
export function looksLikeDiningVenueReservation(ev: DiningReservationTextFields): boolean {
  const title = norm(ev.title ?? "");
  const hay = joinedHay(ev);

  // English: "Reservation at BARBARA", "Dinner at ...", "Lunch reservation"
  if (/\breservation\b\s+(at|for)\b/i.test(title)) return true;
  if (/\b(dinner|lunch|brunch)\s+(at|reservation)\b/i.test(title)) return true;
  if (/\bbooked\b.*\b(table|dinner|lunch)\b/i.test(hay)) return true;

  // Japanese common patterns
  if (/^予約[：:\s]/i.test(title) || /(食事|飲み会|会食|忘年会|新年会|歓迎会|打ち上げ)/i.test(title)) return true;
  if (
    /(レストラン|飲食店|カフェ|バー|bar|pub|イタリアン|フレンチ|焼肉|寿司|居酒屋|ビストロ|ダイニング|\brestaurant\b|\bdining\b)/i.test(
      hay,
    )
  ) {
    return true;
  }
  if (/(食事|飲み会|ディナー|ランチ|予約|テーブルチェック|opentable|tabelog|食べログ|一休|ぐるなび)/i.test(hay)) {
    return true;
  }

  // Standalone "Reservation" in title (Google default)
  if (/^reservation\b/i.test(title) && title.length < 80) return true;

  return false;
}
