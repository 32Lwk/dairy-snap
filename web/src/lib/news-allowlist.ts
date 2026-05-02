/**
 * 趣味・ニュース系の外部取得で許可するホスト（小文字・www なし想定。実装側で正規化）。
 * 計画の allowlist に合わせ、SSRF 対策でホスト固定。
 */

export const HOBBY_NEWS_ALLOWLIST_HOSTS = new Set([
  "news.yahoo.co.jp",
  "www.news.yahoo.co.jp",
  "sports.yahoo.co.jp",
  "www.sports.yahoo.co.jp",
  "nme-jp.com",
  "www.nme-jp.com",
  "sorae.info",
  "www.sorae.info",
  "www.nature.com",
  "nature.com",
  "www.natureasia.com",
  "natureasia.com",
  "www.newtonpress.co.jp",
  "newtonpress.co.jp",
  "www.cnn.co.jp",
  "cnn.co.jp",
]);

/** 公式サイト扱いで許可する追加ホスト（作品公式ドメインの一例。必要に応じ拡張） */
export const HOBBY_OFFICIAL_EXTRA_HOSTS = new Set([
  "jujutsukaisen.jp",
  "www.jujutsukaisen.jp",
  "chainsawman.dog",
  "www.chainsawman.dog",
  "one-piece.com",
  "www.one-piece.com",
  "conan.jp",
  "www.conan.jp",
]);

export function hobbyAllowlistedHosts(): Set<string> {
  return new Set([...HOBBY_NEWS_ALLOWLIST_HOSTS, ...HOBBY_OFFICIAL_EXTRA_HOSTS]);
}
