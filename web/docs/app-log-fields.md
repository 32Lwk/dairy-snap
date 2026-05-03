# 構造化 AppLog（`scheduleAppLog`）フィールド方針

実装: `src/lib/server/app-log.ts`。stdout 1 行 JSON。`correlationId` は `opts` または乱数。

## オーケストレーター（`scope: chat` / `orchestrator_chat_sse_complete`）

| フィールド | 説明 |
|-----------|------|
| `correlationId` | 同一ターンのログ・クライアント突合用 |
| `promptVersion` | `PROMPT_VERSIONS.reflective_chat` |
| `policyVersion` | `POLICY_VERSIONS.reflective_chat_default` |
| `toolCardsDigest` | `digestToolFactCards(toolFactCards)` の先頭 32 hex |
| `latencyMs` | ストリーム完了までの毫秒 |
| `model` | オーケストレーター実モデル |
| `agentsUsed` | ツール名の一意配列 |
| `entryDateYmd` | エントリ暦日 |
| `preferMiniOrchestrator` | 短文ミニ経路 |

※ `userId` / `entryId` / `threadId` は `APP_LOG_INCLUDE_IDS=1` のときのみ平文（それ以外はマスク）。

## 開口（`scope: opening` / `opening_json_complete` / `opening_sse_complete`）

| フィールド | 説明 |
|-----------|------|
| `correlationId` | `runOrchestrator` 戻り値と一致 |
| `promptVersion` | `PROMPT_VERSIONS.reflective_chat` |
| `policyVersion` | `POLICY_VERSIONS.opening_default` |
| `toolCardsDigest` | 開口ターン終了時点の ToolFactCard ダイジェスト |

## 日記草案（`scope: journal` / `journal_draft_generate_ok`）

| フィールド | 説明 |
|-----------|------|
| `promptVersion` | `PROMPT_VERSIONS.journal_composer` |
| `policyVersion` | `POLICY_VERSIONS.auxiliary_default` |

## 環境変数（運用）

- `APP_LOG_LEVEL`, `APP_LOG_SCOPES`, `APP_LOG_INCLUDE_IDS`: `app-log.ts` 参照。
- メモリ長期ベクトル無効化: `DISABLE_MEMORY_LONG_TERM_EMBEDDINGS=1`
- 長期注入を常にレガシーに: `ORCHESTRATOR_LONG_TERM_VECTOR=0`
- 天気 Redis キャッシュ無効: `DISABLE_TOOL_WEATHER_REDIS_CACHE=1`
- カレンダー日次 fetch の Redis キャッシュ無効: `DISABLE_TOOL_CALENDAR_REDIS_CACHE=1`
- オーケストレータープロンプト差し替え: `ORCHESTRATOR_PROMPT_FILE`（`prompts/agents/<名前>.md`）
- Eval サンプル: `EVAL_SAMPLE_RATE`（0〜1）、`EVAL_SAMPLE_RETENTION_DAYS`（既定 90）— 詳細は `docs/consent-eval-storage.md`
