# 評価用会話ログの同意と保存（仕様）

## 原則

- **既定は保存しない**（オプトイン）。`User.evaluationFullLogOptIn === true` のときのみ `ConversationEvalSample` にユーザー発話・AI 全文を書き込む。
- **E2EE（`EXPERIMENTAL_E2EE`）エントリでは保存しない**（ルートで `encryptionMode === "STANDARD"` を要求）。
- 設定 UI で目的・撤回可能性を明示し、API は `PATCH { evaluationFullLogOptIn }` で更新する。

## サンプリングと保持

- **サンプリング**: 同意済みでも全ターン保存しない場合は `EVAL_SAMPLE_RATE`（0〜1、未設定または ≥1 で全件）を設定する。実装は `src/lib/eval-sampling.ts` の `passesEvalSamplingGate`。
- **保持期限**: `EVAL_SAMPLE_RETENTION_DAYS`（既定 90）。`0` 以下で `expiresAt` 未設定。期限後の削除はバッチジョブ側で実装する想定。
- **任意マスク**: `EVAL_REDACT_EMAIL=1` で保存直前にメール風文字列を `[redacted-email]` に置換（厳密な PII 分類ではない）。実装は `src/server/eval/conversation-eval-sample.ts`。

## アクセス

- アプリの一般 API から Eval テーブルを読み出さない。運用は DB ロール／バックオフィス経路に限定する。
