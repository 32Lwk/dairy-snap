# BigQuery への Eval／ログ連携（設計メモ）

## 推奨リージョン

アプリ・Cloud SQL と揃えて **asia-northeast2（大阪）** にデータセットを置く。別リージョンへ載せるとエグレス単価が乗りやすい。

## 経路

1. **一次**: Postgres の `conversation_eval_samples`・`turn_context_snapshots`・構造化 stdout（Cloud Logging）。
2. **分析**: 定期的バッチで Postgres から CSV／Avro エクスポートし、BigQuery へロード（`bq load` または Data Transfer）。ストリーミング挿入よりパーティション日付単位のバッチがコスト安定しやすい。サンプル CSV 前段として `scripts/bq-export-eval-samples.mjs` を参照。

## テーブル例（BQ）

- `eval_samples`: `user_id`, `created_at`, `prompt_version`, `policy_version`, `thread_id`（PII 列は別プロジェクト／マスク列と分割を検討）
- パーティション: `DATE(created_at)`

## 運用上の注意

- Eval 全文は **ユーザー明示オプトイン** のみ（アプリ側で既にゲート）。
- E2EE エントリは保存しない（コード側で除外）。
