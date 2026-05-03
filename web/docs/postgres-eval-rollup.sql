-- 日次: 評価サンプル件数（例: 運用ダッシュボード・cron 集計用）
-- conversation_eval_samples.user_id / created_at を前提

SELECT
  DATE(created_at AT TIME ZONE 'UTC') AS day_utc,
  COUNT(*) AS eval_sample_rows,
  COUNT(DISTINCT user_id) AS distinct_users
FROM conversation_eval_samples
GROUP BY 1
ORDER BY 1 DESC
LIMIT 120;

-- ユーザー別直近（任意）
SELECT user_id, COUNT(*) AS n, MAX(created_at) AS last_at
FROM conversation_eval_samples
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY n DESC
LIMIT 200;
