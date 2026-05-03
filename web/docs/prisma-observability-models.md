# Prisma: 観測・評価用モデル（メモリ／ツール計画）

## マイグレーション

- 一括: `prisma/migrations/20260503071442_memory_tool_policy_snapshots/migration.sql`
- 内容: `User.evaluationFullLogOptIn`、`AIArtifact.policyVersion`、`turn_context_snapshots`、`conversation_eval_samples`

## テーブル対応

| モデル | 用途 |
|--------|------|
| `TurnContextSnapshot` | 1 ターン分の `toolCardsJson`（正規化 ToolFactCard）・`digest`・`promptVersion` / `policyVersion`。再現性・監査。 |
| `ConversationEvalSample` | オプトイン + `STANDARD` 暗号化時のユーザー／アシスタント全文。`label` 任意・`expiresAt` 保持期限。 |

## ルート保存例

- 振り返りチャット: `app/api/ai/orchestrator/chat/route.ts`（スナップショット + Eval 条件付き）
- 開口: `server/ai-opening-post.ts`（`userMessageId` は null 可）
- 編集再生成: `server/reflective-chat-user-edit-regeneration.ts`
