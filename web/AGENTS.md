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
