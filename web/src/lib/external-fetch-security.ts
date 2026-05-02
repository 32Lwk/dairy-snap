/**
 * 外部 URL 取得のセキュリティ方針（レビュー用メモ）
 *
 * - **ホスト allowlist**（`news-allowlist.ts` / `safe-allowlisted-fetch.ts`）で SSRF 緩和。
 * - **レスポンス上限**（現状 512KB）・**タイムアウト**でメモリ枯渇を抑制。
 * - **プライベート IP・メタデータ URL** への直接取得は未ブロック—本番は VPC・Egress 制御を推奨。
 * - **robots / ToS** はドメインごとに運用確認（Nature 等は要約＋リンクを既定）。
 */

export {
  fetchAllowlistedUrlExcerpt,
  normalizeUrlForFetch,
  urlHostAllowed,
  sha256Hex,
} from "@/lib/safe-allowlisted-fetch";
