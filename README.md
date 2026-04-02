# daily-snap

個人向け日記サービス「daily-snap」のローカル MVP 実装です。要件は `purompt.md` を正とし、まず Web（PWA）を完成させ、将来 React Native（Expo）から同じ API を叩ける設計にします。

## ローカル開発

### 1) DB 起動

```bash
docker compose up -d
```

### 2) 環境変数

`web/.env.example` を `web/.env` にコピーし、`AUTH_SECRET` / Google OAuth / `OPENAI_API_KEY` 等を設定します。

### 3) マイグレーション

```bash
cd web
npm run db:migrate
```

### 4) Web 起動

```bash
cd web
npm run dev
```

### ビルド（CI / 秘密未設定時）

`npm run build` は `SKIP_ENV_VALIDATION=1` を付与しています。本番では `.env` を揃え、必要なら検証を有効にしてください。

## 方針（要点）

- **認証**: Google OAuth + 許可リスト（許可されていないメールは 403）
- **DB**: Postgres + pgvector（ローカルは Docker）
- **画像**: MVP はストレージ抽象＋ローカル実装。本番は GCS を差し替え
- **PWA**: `@ducanh2912/next-pwa` + `manifest.webmanifest`。オフライン追記は IndexedDB キュー（`/today`）
- **暗号化**: 設定で `標準` / `実験(E2EE)` を選択可能。完全な鍵束・クライアント暗号化は継続実装予定
- **AI**: OpenAI を第一実装（チャットは SSE ストリーミング、MAS の骨格あり）

## 将来の GCP（本番想定）

- **Compute**: Cloud Run（Next.js コンテナ）または Cloud Run + 分離 API
- **DB**: Cloud SQL for PostgreSQL（pgvector 拡張）
- **オブジェクト**: Cloud Storage（署名付き URL）
- **非同期**: Cloud Tasks / Pub/Sub + Scheduler

## 補足

- 本番ビルドは PWA プラグイン都合で `next build --webpack` を使用しています。
- セッションは Edge 互換のため **JWT**（DB セッションではない）です。ユーザー行は Prisma に保存されます。
