# BigQuery 取り込み（GCP 運用の目安）

## 方針

- **バッチロード**（日次または数時間おき）で Postgres から CSV/Parquet を Cloud Storage へ出し、`bq load` で **asia-northeast2** のデータセットへ取り込む。
- ストリーミング挿入は高頻度 Eval 時のコストが上がりやすいため、本番はバッチ優先。

## 例: Cloud Scheduler → Cloud Run Job

1. ジョブ内で `node scripts/bq-export-eval-samples.mjs` 相当（または `pg_dump` 絞り）を GCS に書き出す。
2. 完了後 `bq load --location=asia-northeast2`。
3. Scheduler の HTTP/Pub/Sub から Job 実行。失敗時は再試行ポリシー。

詳細スキーマ（PII 列の分離・パーティション `DATE(created_at)`）は `docs/bigquery-eval-sync.md` を参照。
