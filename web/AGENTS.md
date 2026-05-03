<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Conventions

- `select`: ネイティブの`<select>`は使用しない（OS/ブラウザ依存のドロップダウンになり、見た目が統一できないため）
- `FancySelect`: `@/components/fancy-select` の `FancySelect` を使う

## ユニットテスト（カレンダー日付・祝日）

- `npm test` … Vitest。Google 終日の **排他的終了日** と「指定暦日に重なる予定」Prisma 条件の回帰、`resolveJapaneseHolidayNameForEntry` の誤祝日混入防止を `src/lib/time/tokyo-calendar-interval.test.ts` / `src/lib/jp-holiday.test.ts` で固定している。
- 終日の `startAt`/`endAt` を変える・日次 fetch の `where` を触るときは必ず `npm test` を通す。

## サーバー構造化ログ（非同期）

- 実装: `src/lib/server/app-log.ts` の `scheduleAppLog(scope, level, msg, fields?, { correlationId? })`。**setImmediate** で stdout へ JSON 1 行を回し、リクエスト本体をブロックしない。
- **環境変数**: `APP_LOG_LEVEL` = `off` | `error` | `warn` | `info` | `debug`（未設定時 `warn`）。`APP_LOG_SCOPES` = カンマ区切り（**info/debug のみ**フィルタ; error/warn は常に全 scope）。`APP_LOG_INCLUDE_IDS=1` で userId 等のマスクを外す（本番は基本オフ）。
- **開口**: `debug` で `opening_topic_scores`（祝日・カレンダー件数・開口優先トピック・イベントごとの推定カテゴリサンプル）、`info` で `opening_sse_complete`（latency・モデル・`correlationId`）。`runOrchestrator` の戻り値 `correlationId` でログを突合。
- **その他ルート（例）**: 通常チャット `api/ai/orchestrator/chat`（`orchestrator_chat_*`）、カレンダー `api/calendar/events`・`api/calendar/event`、日記 `api/entries`・`api/entries/[entryId]`、設定 `api/settings`、草案 `api/ai/journal-draft`、記憶検索 `api/memory/search`、アカウント削除 `api/account/delete`。
- `AppLogScope`: `opening`, `chat`, `calendar`, `entries`, `settings`, `journal`, `memory`, `account`, `api`, …（`app-log.ts` 参照）。他機能も同 API で追加可。

## メモリ／ツール／評価・運用 Runbook（要約）

- **Prisma マイグレーション**: `npm run db:migrate`（本番はデプロイパイプラインに合わせる）。
- **長期ベクトル**: 既定で有効。オフは `DISABLE_MEMORY_LONG_TERM_EMBEDDINGS=1`。オーケストレーターでベクトル注入を止めるだけなら `ORCHESTRATOR_LONG_TERM_VECTOR=0`。
- **Redis**: `REDIS_URL` 未設定時はキャッシュ・エクスポートレート制限ともインメモリ縮退。天気キャッシュだけオフにする場合は `DISABLE_TOOL_WEATHER_REDIS_CACHE=1`。
- **プロンプト緊急差し替え**: `ORCHESTRATOR_PROMPT_FILE=<basename>` → `prompts/agents/<basename>.md` を読む（英数字・`_`-のみ）。
- **版文字列の緊急ロールバック（ログ・Artifact と一致）**: 設定 GET の `effectivePromptVersions` / `effectivePolicyVersions` と同一規則。例: `PROMPT_VERSION_OVERRIDE_REFLECTIVE_CHAT`、`POLICY_VERSION_OVERRIDE_OPENING`、`POLICY_VERSION_OVERRIDE_REFLECTIVE_CHAT`、`POLICY_VERSION_OVERRIDE_AUXILIARY`、`PROMPT_VERSION_OVERRIDE_JOURNAL_COMPOSER`、`PROMPT_VERSION_OVERRIDE_PLUTCHIK_EMOTION`。未設定時はコード内の `PROMPT_VERSIONS` / `POLICY_VERSIONS`。
- **評価サンプル**: DB `User.evaluationFullLogOptIn` とエントリ `STANDARD` の両方で `conversation_eval_samples` に書き込み。設定 UI でオプトイン変更可。サンプリング `EVAL_SAMPLE_RATE`、保持 `EVAL_SAMPLE_RETENTION_DAYS`（`docs/consent-eval-storage.md`）。
- **カレンダー Redis キャッシュ**: `fetchCalendarEventsForDay` が成功結果を短 TTL でキャッシュ。無効化は `DISABLE_TOOL_CALENDAR_REDIS_CACHE=1`。
- **フィールド一覧**: `docs/app-log-fields.md`。BQ 同期の考え方: `docs/bigquery-eval-sync.md`。Postgres 集計クエリ例: `docs/postgres-eval-rollup.sql`。CSV 前段: `scripts/bq-export-eval-samples.mjs`。
