#!/usr/bin/env node
/**
 * Postgres の conversation_eval_samples を CSV に吐き、BigQuery へ `bq load` する前段の例。
 *
 * 使い方（例）:
 *   node scripts/bq-export-eval-samples.mjs > /tmp/eval.csv
 *   bq load --location=asia-northeast2 --source_format=CSV --autodetect \
 *     your_dataset.eval_samples /tmp/eval.csv
 *
 * 本番では Cloud Scheduler + Cloud Run Job / Workflows で同様のパイプラインを組む。
 *
 * 依存: DATABASE_URL（pg）。未設定ならヘッダのみ出力して終了。
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("id,user_id,thread_id,created_at,prompt_version,policy_version");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const res = await client.query(
  `SELECT id, "userId", "threadId", "createdAt", "promptVersion", "policyVersion"
   FROM conversation_eval_samples
   WHERE "createdAt" > NOW() - INTERVAL '2 days'
   ORDER BY "createdAt" ASC
   LIMIT 50000`,
);
console.log("id,user_id,thread_id,created_at,prompt_version,policy_version");
for (const row of res.rows) {
  const line = [
    row.id,
    row.userId,
    row.threadId,
    row.createdAt?.toISOString?.() ?? "",
    row.promptVersion ?? "",
    row.policyVersion ?? "",
  ]
    .map((s) => `"${String(s).replace(/"/g, '""')}"`)
    .join(",");
  console.log(line);
}
await client.end();
