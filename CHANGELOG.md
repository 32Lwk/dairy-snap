# daily-snap 更新履歴

本リポジトリの変更内容を日付ベースでまとめたものです。README とは別ファイルとして保守します。最終更新: **2026-04-20**。

---

## 2026-04-20（ワーキングツリー反映・本ドキュメント作成）

`main` への反映コミット: `c73490b`（`origin/main` にプッシュ済み）。

このコミットには、主に以下の領域が含まれます。

### データベース（Prisma マイグレーション）

| マイグレーション | 内容の要約 |
|------------------|------------|
| `20260419180000_security_review` | セキュリティレビュー関連のスキーマ拡張 |
| `20260419190000_memory_subagent_counter` | メモリ／サブエージェント用カウンタ |
| `20260419200000_chat_thread_memory_backfill` | チャットスレッドと長期メモリのバックフィル |
| `20260420000000_image_google_media_item_id` | 画像と Google Photos の `mediaItemId` の対応 |
| `20260420103000_chat_thread_memory_backfill_camel` | 上記バックフィル系の列名（camelCase）整合 |
| `20260420110000_usage_counter_memory_subagent_camel` | 利用カウンタとメモリ／サブエージェントの camelCase 整合 |
| `20260420120000_plutchik_emotion` | Plutchik モデルに基づく感情スコア／メタ |
| `20260420160000_app_local_calendars` | アプリ内ローカルカレンダーとイベント |

### バックエンド・API

- **内部セキュリティ**: `internal/security-review`、キュー／ジョブ（`security-review-queue`, `security-review-job`）、設定・同期ルール。
- **カレンダー**: ローカルカレンダー API（`local-calendars`）、イベント CRUD（`calendar/event`）、サーバー側 `app-local-calendar.ts` と `calendar.ts` の拡張。
- **エントリ**: Plutchik 感情 API（`entries/[entryId]/plutchik-emotion`）。
- **Google Photos**: プレビュー API、ピッカー／アイテム連携の強化、`googleMediaItemId` 連携、インポート用クライアント・日付ヘルパ。
- **設定・メモリ**: メモリ API の拡張、チャットとメモリの reconcile（`settings/memory/reconcile-chat`）、MAS メモリ（`mas-memory.ts`）の大規模更新。
- **AI エージェント**: オーケストレーター／ジャーナル下書き／メタ／チャット／オープニング、各カレンダー系・学校・趣味等エージェントルートの調整。セキュリティレビュアー用プロンプト追加。
- **チャット**: メッセージ更新 API の強化、アシスタント応答のサニタイズ、スレッド上のセキュリティ注意文言。
- **画像**: アップロード上限・クライアント、`images` ルートの拡張、エントリ画像 API の調整。
- **認証**: `auth.ts` の軽微な更新。
- **利用状況**: `usage.ts` のカウンタ対応。

### フロントエンド（UI）

- **カレンダー**: イベント編集ダイアログ、クライアントの操作性向上。
- **エントリ（日付別）**: レイアウトシェル、ビュー分割、タイトル編集、AI メタボタン、チャット・画像・ジャーナル下書きパネルの拡張（下書きパネルは大きな機能追加）。
- **今日**: メイングリッド調整、`today-entry-detail-promo` の削除。
- **設定**: フォーム・Apple 再接続・メモリパネルの拡張。
- **共通**: Plutchik ホイール／チップ／モバイル詳細、Google フォト取り込みダイアログ、レスポンシブダイアログ、メインレイアウト、天気 AM/PM 表示。

### ライブラリ・プロンプト

- 感情: `lib/emotion/plutchik*`、エージェント `plutchik-emotion.ts`、プロンプト `plutchik-emotion.md`。
- ジャーナル: `ground-suggested-tags.ts`、ジャーナルコンポーザー／オーケストレーター／MAS メモリ系プロンプトの更新・追加（日記用・チャットバックフィル・スレッド reconcile）。
- 内省チャット: `reflective-chat-diary-nudge-rules.ts`、`reflective-chat-user-edit-regeneration.ts`。
- OpenAI チャットモデル設定の更新。

### インフラ

- ルートおよび `web/Dockerfile` の小変更、`next.config.ts` の調整。
- `package.json` / `package-lock.json` の依存更新。

---

## GitHub コミット履歴（日付別・要約）

リポジトリ `origin/main` 上の履歴を、**コミット日**でグルーピングした要約です（マージコミットは機能ブランチの取り込みとして扱い、同日の実変更とまとめて記載）。

### 2026-04-19

- Apple サインイン（UI・未設定時もボタン表示）、Google フォトピッカー UI、認証まわりの修正（セッション不一致ループ等）。
- オーケストレーターのオープニング、エントリレイアウト、OpenAI モデルフォールバック、各種エージェント更新。
- 統一検索、カレンダーキャッシュ API、Google カレンダー検索まわりの移行。

### 2026-04-18

- Playwright テスト成果物の gitignore。
- 環境変数・認証・アクセス制御の整理（`access-control` 集約、全員許可モード）。
- カレンダー・設定・ボトムナビの更新、`.gitignore` 調整。
- レスポンシブ UI、カレンダー／日記／設定、Playwright スモーク。

### 2026-04-17

- MAS メモリ設定、固定カレンダーカテゴリ。
- HTTPS／プロキシ環境向け `secureCookie` の `getToken` 修正。
- 認証ゲートをミドルウェアから Next.js proxy へ移行。
- NextAuth / Auth.js 環境・セッションプロバイダの整合。
- ログインページへの Google サインイン追加。

### 2026-04-16

- Cloud Run: `PORT` 尊重、ビルド用ダミー `DATABASE_URL`、Node ヒープ、Prisma クライアント生成、ルート Dockerfile（Cloud Build）。
- Next.js standalone 出力を用いた Docker イメージ。
- 逆ジオコーディング API と座標まわり。

### 2026-04-10

- カレンダー設定と `calendarCategoryById` のマージ・コンフリクト解消。
- 内省チャット向け MAS（マルチエージェント）実装。
- カレンダーオープニングの話題分類と色メタデータ。
- Cursor クラウドエージェント向けローカル変更の取り込みコミット。

### 2026-04-06

- Refpro 側 `.gitignore` の削除。
- Google カレンダーイベントキャッシュと同期状態。

### 2026-04-05

- Refpro（iOS / Firebase 参照プロジェクト）を通常ツリーとして追加。
- オンボーディング、設定同期、学校検索、アカウント系 API。

### 2026-04-02

- 環境変数の暗号化／復号ツール。
- 初期コミット（プロジェクト開始）。

---

## 参照方法

ローカルで日付付きの一覧だけ再取得する場合の例:

```bash
git log --date=short --format="%ad %h %s" --no-merges
```

マージコミットも含めて時系列で見る場合:

```bash
git log --date=short --format="%ad %h %s"
```
