# daily-snap 更新履歴

本リポジトリの変更を **日付（AuthorDate）** 単位で整理したドキュメントです。README とは別ファイルとして保守します。

**最終更新**: 2026-04-28  
**対象期間**: 2026-04-02（初期コミット）〜 2026-04-28（`main` 先端＋同日の作業ツリー追記）

---

## 記載方針・凡例

| 項目 | 説明 |
|------|------|
| **日付** | `git log --date=short` に表示されるコミット日（ローカルタイムゾーン依存）。 |
| **ハッシュ** | 先頭 7 文字。完全な SHA は `git show <hash>` で参照。 |
| **マージコミット** | `Merge pull request #…` はブランチ取り込み。本文に PR 説明が付く場合は要約に含める。 |
| **「コミットなし」日** | その暦日に **1 件もコミットが無い** ことを明示する（開発が止まったとは限らない）。 |
| **深さ** | 各日について、コミット一覧 → 技術内容 → DB/API/UI の順でできるだけ具体的に記載する。 |

先端コミットの確認:

```bash
git log -1 --oneline origin/main
```

---

## 目次（日付ジャンプ）

| 日付 | コミット | 節 |
|------|----------|-----|
| 2026-04-02 | あり | [§ 04-02](#2026-04-02木) |
| 2026-04-03 | なし | [§ 04-03](#2026-04-03金) |
| 2026-04-04 | なし | [§ 04-04](#2026-04-04土) |
| 2026-04-05 | あり | [§ 04-05](#2026-04-05日) |
| 2026-04-06 | あり | [§ 04-06](#2026-04-06月) |
| 2026-04-07〜09 | なし | [§ 04-07〜09](#2026-04-07火-2026-04-09木) |
| 2026-04-10 | あり | [§ 04-10](#2026-04-10金) |
| 2026-04-11〜15 | なし | [§ 04-11〜15](#2026-04-11土-2026-04-15水) |
| 2026-04-16 | あり | [§ 04-16](#2026-04-16木) |
| 2026-04-17 | あり | [§ 04-17](#2026-04-17金) |
| 2026-04-18 | あり | [§ 04-18](#2026-04-18土) |
| 2026-04-19 | あり | [§ 04-19](#2026-04-19日) |
| 2026-04-20 | あり | [§ 04-20](#2026-04-20月) |
| 2026-04-21〜27 | なし | [§ 04-21〜27](#2026-04-21火-2026-04-27月) |
| 2026-04-28 | 作業ツリー | [§ 04-28](#2026-04-28火) |

---

## 2026-04-02（木）

### コミット一覧

| ハッシュ | メッセージ |
|----------|------------|
| `13341ca` | Initial commit |
| `55073fe` | Add env encryption/decryption tooling |

### `13341ca` — プロジェクト立ち上げ（MVP の骨格）

**規模**: 113 ファイル、約 1.9 万行追加。

**インフラ・リポジトリ**

- ルート `docker-compose.yml`（Postgres 想定）、`.gitignore`
- 要件メモ `purompt.md`（プロダクトの正として参照）
- `README.md`（ローカル開発手順の初版）

**Web（`web/`）— アプリ基盤**

- **Next.js**: `next.config.ts`、`app/layout.tsx`、`globals.css`、`package.json` / lock
- **Prisma**: `schema.prisma`、初期マイグレーション `20250402000000_init`（日記エントリ、チャット、画像、設定、カレンダー連携の土台となるテーブル群）
- **PWA**: `manifest.webmanifest`
- **認証**: `auth.ts`、NextAuth ルート `api/auth/[...nextauth]`、`login` / `forbidden`
- **環境**: `env.ts`、`.env.example`

**主要ドメイン機能（初版から実装済みの範囲）**

- **日記エントリ**: `entries/[date]/`（`page.tsx`、`entry-actions.tsx`、`entry-chat.tsx`、`entry-images.tsx`）
- **今日**: `today/page.tsx`、`today-append-form.tsx`
- **カレンダー**: `calendar/page.tsx`、`upcoming-google-events.tsx`
- **オンボーディング**: `onboarding/`（チャットフロー・クライアント）
- **設定**: `settings/`（フォーム、カレンダー再接続、旧 `bb84` ページ）
- **検索**: `search/`（クライアント）
- **AI API**: `api/ai/chat`、`chat/opening`、`journal-draft`、`image-gen`、`meta`
- **データ API**: `entries`、`entries/[entryId]`、`images`、`chat-threads`、`chat-messages`、`calendar/events|status`、`memory/embed|search`、`settings`、`me`
- **サーバー**: `server/db.ts`、`calendar.ts`、`journal.ts`、`embeddings.ts`、`weather*.ts`、`storage/local.ts`、`usage.ts`
- **オフライン**: `lib/offline/queue.ts`（PWA 方針の足場）
- **興味・性格**: `interest-taxonomy.ts`、`mbti.ts`、`user-settings.ts`
- **MAS（初期）**: `lib/mas/*`（ジャーナルコンポーザー等の薄い層）
- **ミドルウェア**: `middleware.ts`（当時の認証ゲート）

**運用上の含意**

- 以降のコミットはこのスキーマと UI ラインを前提に積み上げられる。
- 「日記＋画像＋天気＋チャット＋設定」の縦割りが最初から揃っている。

### `55073fe` — 環境変数の暗号化ツール

**追加ファイル**

- `web/README-env-encryption.md`（手順書）
- `web/scripts/env-encrypt.ps1` / `env-decrypt.ps1`（PowerShell）
- `web/env/age/recipients.txt`（age 受信者）
- `web/package.json` に関連スクリプト依存

**目的**

- `.env` をそのままリポジトリに置かず、チーム／CI での共有やバックアップ方針を明文化。
- **age** ベースの暗号化フローを Windows 開発環境から実行可能にする。

---

## 2026-04-03（金）

### リポジトリ上の活動

**この日付のコミットは `git log` 上にありません。**

### 文脈

- 直前（04-02）で MVP 土台と env 暗号化が入り、次の大きな塊は 04-05 のオンボーディング／学校データ／Refpro 追加まで空く。
- ローカル作業のみの日、またはコミット前の設計・検証期間に相当する可能性がある。

---

## 2026-04-04（土）

### リポジトリ上の活動

**この日付のコミットはありません。**

### 文脈

- 翌 04-05 にユーザー設定拡張・学校 CSV・Refpro ツリー追加がまとまって入るため、その準備やデータ取得に当たる期間の可能性がある。

---

## 2026-04-05（日）

### コミット一覧

| ハッシュ | メッセージ |
|----------|------------|
| `5c03cf8` | Add onboarding flows, settings sync, school search, and account APIs |
| `1b8b1e8` | Add Refpro iOS/Firebase reference project as regular tree |

### `5c03cf8` — オンボーディング、設定同期、学校検索、アカウント API

**コミット本文より**

- ユーザー設定・興味タクソノミーの拡張、ミドルウェア／認証まわりの強化
- 学校データパイプライン、時間割、エージェント用ペルソナ UI
- **MEXT 学校 CSV** を `web/date/school` 配下に同梱

**技術的含意**

- オンボーディングは「チャット形式の初回設定」として既存 `onboarding` ルートを拡張する方向。
- 学校検索は後続の MAS `school` エージェントや設定フォームと接続される基盤。

### `1b8b1e8` — Refpro 参照ツリーの取り込み

- **Refpro**（iOS / Firebase 参照実装）を **サブモジュールではなく通常ファイル** として追加。
- ネストされた `.git` を削除し、本リポジトリの履歴で一元管理可能にした。
- 以降、日記アプリ本体とは独立した「参照用コピー」として閲覧・差分検索が可能。

---

## 2026-04-06（月）

### コミット一覧

| ハッシュ | メッセージ |
|----------|------------|
| `0fc3682` | Add Google Calendar event cache and sync state |
| `f08a9a7` | Remove Refpro .gitignore |

### `0fc3682` — Google カレンダーイベントのキャッシュと同期状態

**コミット本文より**

- 取得した GCal イベントを **永続化**
- **カレンダー単位の同期状態** を保持
- `calendar` の Events API に **同期制御・デバッグ向け** の拡張（レンジ／件数制限など）

**含意**

- 以降の「カレンダーを開いた話題」「色メタデータ」「統一検索」は、このキャッシュ層の上に載る。
- API 負荷とユーザー体験のバランス（再取得 vs キャッシュ）の基礎がここで入る。

### `f08a9a7` — Refpro 専用 `.gitignore` の削除

- Refpro は **参照のみ** とし、参照プロジェクト側の ignore ルールを本リポジトリから外す。
- 不要な二重管理や、本体の `.gitignore` との齟齬を避ける意図。

---

## 2026-04-07（火）〜 2026-04-09（木）

### リポジトリ上の活動

**この期間いずれの日付にもコミットはありません。**

### 文脈

- 次のまとまった変更は **04-10**（オープニング分類、MAS、カレンダー UI マージ等）。
- 約 4 日のブランクの後、マルチエージェントとカレンダー分類が一気に入るため、設計・手元検証・ブランチ作業がコミット化されていない可能性がある。

---

## 2026-04-10（金）

### コミット一覧

| ハッシュ | メッセージ |
|----------|------------|
| `90a1844` | Add calendar opening topic classification and color metadata |
| `f8fbb33` | Cursor: Apply local changes for cloud agent |
| `e6de2ba` | feat: implement MAS multi-agent system for reflective chat |
| `725ccb1` | fix: merge calendar settings with calendarCategoryById and stash conflict resolution |

### `90a1844` — カレンダーオープニングの話題分類と色

**コミット本文より**

- GCal キャッシュに **カレンダー名・色** メタを保持
- **オープニング話題** の推薦ロジック
- **設定 UI と API** で分類チューニング可能に

**ユーザー価値**

- 内省チャットの冒頭で「今日の予定から自然に話題が立つ」体験の前提データが揃う。

### `f8fbb33` — クラウドエージェント向けローカル変更の取り込み

- メッセージのみのメタコミット。差分は Cursor クラウド作業の同期用途。
- 詳細は当該コミットの `git show` を参照。

### `e6de2ba` — 内省チャット向け MAS（マルチエージェント）

**規模**: 31 ファイル、+2082 / -342 行。

**Prisma（コミット本文より）**

- `AgentMemory`、`AgentEvaluation`
- `ChatMessage.agentName`
- `UsageCounter.orchestratorCalls`

**共有型・定数**

- `AgentRequest` / `AgentResponse`、`PersonaContext`、`WeatherContext`、`ORCHESTRATOR_TOOLS`

**プロンプト（`web/prompts/agents/`）**

- `orchestrator`、`school`、カレンダー `daily` / `work` / `social`、`hobby`、`romance`、`supervisor`

**エージェント実装（当時 `web/src/server/agents/`）**

- `weather-tool.ts` — DB の `entry.weatherJson` を優先、無ければ Open-Meteo
- `school-agent.ts` — 時間割の日スライス + `AgentMemory` 読み書き
- カレンダー系 — カテゴリでイベントをフィルタ、ペルソナ考慮
- `hobby-agent.ts` — `interestPicks` / `hobbies`、MBTI ルーティング
- `romance-agent.ts` — Love MBTI、`avoidTopics` ガード
- `supervisor-agent.ts` — 非同期品質・ルーティング・ペルソナ採点

**オーケストレーター**

- `server/orchestrator.ts` — gpt-4o の Tool Calling ループ、並列ディスパッチ、ストリーミング

**API**

- `/api/ai/orchestrator/chat`、`/opening`
- `/api/ai/agents/*` 各サブエージェント HTTP ルート（将来のサービス分割を見据えた境界）
- 旧 `/api/ai/chat` と `/opening` は **後方互換のリダイレクト** に置換

**利用枠**

- `usage.ts` に `incrementOrchestratorCalls`

### `725ccb1` — カレンダー設定と `calendarCategoryById` の統合

**コミット本文より**

- `user-settings` と Settings API スキーマに **`calendarCategoryById` を復元・統合**
- チャット文脈スコアリングに `CALENDAR_DEFAULT_CATEGORY_WEIGHT` を統合
- **カレンダー UI**: 横スクロールのフィルタチップ、カレンダー別プリセット色、アクティブカレンダーピッカー
- `CALENDAR_GRID_COLOR_PRESETS`（`gcal-event-color`）でドット色 UI

**含意**

- 04-10 時点で「分類メタ」と「ユーザー別カテゴリ上書き」と「グリッド色」が一貫した設定モデルに収束し始めた。

---

## 2026-04-11（土）〜 2026-04-15（水）

### リポジトリ上の活動

**いずれの日付もコミットなし。**

### 文脈

- **04-16** に Docker / Cloud Build / 逆ジオコーディングなど運用・位置情報の塊が入るまで、リポジトリ上は静止。
- 本番ビルドやデプロイパイプラインの試行がこの週末〜週前半に行われた可能性はあるが、履歴には表れない。

---

## 2026-04-16（木）

### コミット一覧（時系列）

| ハッシュ | メッセージ |
|----------|------------|
| `3b63893` | feat(web): reverse geocode API and place coordinates |
| `e5b7366` | feat(web): add Docker image with Next.js standalone output |
| `796d5a4` | fix(build): add root Dockerfile for Cloud Build |
| `adb9111` | fix(build): generate Prisma client in builder stage |
| `72389ec` | fix(build): increase Node heap for Next build |
| `11421d5` | fix(build): set dummy DATABASE_URL for Next build |
| `6f40a63` | fix(cloudrun): respect PORT env |

### `3b63893` — 逆ジオコーディングと「場所の一行」

- **API**: `/api/geocode/reverse` とクライアントヘルパー
- **UI**: `place-coords-line` コンポーネント
- **配線**: エントリアクション、設定、プロキシ（当時のゲート構成）
- **`.gitignore`**: ローカル `.uploads` を除外

**ユーザー価値**

- 日記に紐づく座標から地名・表示用ラベルを引けるようになり、天気・地図ピッカー等と接続しやすくなる。

### Docker / Cloud Build 連鎖（`e5b7366` → `6f40a63`）

| コミット | 内容 |
|----------|------|
| `e5b7366` | Next.js **standalone** 出力を使った Docker イメージ（本番コンテナ実行の基盤） |
| `796d5a4` | Cloud Build が期待する **リポジトリルート `Dockerfile`** を追加（`/workspace/Dockerfile`） |
| `adb9111` | ビルダーステージで **`prisma generate`** をソースコピー後に実行し、生成クライアント欠落を防止 |
| `72389ec` | `NODE_OPTIONS=--max-old-space-size` で **Next ビルドの OOM** を抑制（Cloud Build のメモリ制約対策） |
| `11421d5` | ビルド時に **ダミー `DATABASE_URL`** を渡し、データ収集フェーズでの Prisma 失敗を回避 |
| `6f40a63` | **Cloud Run の `PORT`** を尊重。ランタイムイメージは 8080 を expose |

**運用メモ**

- これらは「ローカルでは動くが CI/本番で落ちる」系の典型対策が一日で固まった形。

---

## 2026-04-17（金）

### コミット一覧（時系列）

| ハッシュ | メッセージ |
|----------|------------|
| `6e493a6` | feat(web): add Google sign-in on login page |
| `d1648ce` | fix(web): align NextAuth setup with Auth.js env and session provider |
| `8b0fd31` | fix(web): migrate auth gate from middleware to Next.js proxy |
| `ed1b289` | fix(web): pass secureCookie to getToken for HTTPS and proxied requests |
| `85f898d` | feat(web): add MAS memory settings and fixed calendar categories |

### 認証まわり（`6e493a6` → `ed1b289`）

- **ログイン UI** に Google サインインを明示（`6e493a6`）
- **Auth.js 系の環境変数・セッションプロバイダ** と NextAuth 設定を整合（`d1648ce`）
- **ミドルウェア廃止** → **`proxy.ts`**（Node ランタイム、`next-auth/jwt` 利用）へ認証ゲートを移行（`8b0fd31`）
  - `Dockerfile` 更新、`web/docker-entrypoint.sh` 追加
- **HTTPS / リバースプロキシ** 下で `getToken` に **`secureCookie`** を渡す修正（`ed1b289`）

**含意**

- Edge 制約とセッション検証の要件を分離し、本番プロキシ背後でも安定しやすい構成へ。

### `85f898d` — MAS メモリ設定と固定カレンダーカテゴリ

- 設定画面から **長期メモリ（MAS）** を調整できる UI／API の足場
- **固定カレンダーカテゴリ**（仕事／学校／プライベート等の運用ルール）を設定と同期

---

## 2026-04-18（土）

### コミット一覧（時系列）

| ハッシュ | メッセージ |
|----------|------------|
| `7689dd0` | feat(web): responsive UI, calendar/journal/settings, Playwright smoke |
| `b7b1a3b` | カレンダー・設定・ボトムナビの更新と .gitignore 調整 |
| `93b4884` | アクセス制御を access-control に集約し、全員許可モードに対応 |
| `81c373a` | chore(web): env, auth, and access-control updates |
| `caf6a85` | chore: ignore Playwright web/test-results output |

### `7689dd0` — レスポンシブ UI、カレンダー／日記／設定、Playwright

**規模**: カレンダークライアントを中心に **千行超** の変更を含む大型コミット。

**カレンダー**

- `[date]` ルート、**月リスト** `month-list.tsx`、ビュー永続化 `calendar-view-persistence.ts`
- **自動分類 API** `api/calendar/auto-classify-calendar`、LLM 補助 `calendar-classify-llm.ts`
- **スコアリング** `calendar-opening-auto-score.ts` 等

**エントリ／日記**

- **サイドバーナビ** `entries-nav-sidebar.tsx`、`entries/layout.tsx` 強化
- **ジャーナル下書きパネル** `journal-draft-panel.tsx` の初版追加
- `entry-actions` / `entry-chat` の調整

**今日**

- `today-main-grid`、`today-entry-detail-promo` 追加
- **`today-append-form` 削除**（UI 方針の整理）

**設定**

- 設定ページ拡張、**天気地図ピッカー** `weather-location-map-picker.tsx`

**共通 UI**

- **`responsive-dialog.tsx`**（モバイル／デスクトップで挙動を分けるダイアログ基盤）
- `globals.css` トークン調整

**品質保証**

- `playwright.config.ts`、スモークテスト、`docs/responsive-ui-plan.md`

### `93b4884` / `81c373a` — アクセス制御の単一モジュール化

- **`access-control`** に集約（許可リスト・403 の一貫した扱い）
- **「全員許可」モード**（開発用／クローズドβ の運用自由度）

### Playwright / gitignore（`caf6a85` と関連）

- `web/test-results` を ignore（ローカル／CI の成果物汚染防止）

---

## 2026-04-19（日）

### コミット一覧（時系列・マージ含む）

| ハッシュ | メッセージ |
|----------|------------|
| `ebddfa2` | feat(web): unified search, calendar cache API, GCal search migration |
| `ed42c52` | feat(web): orchestrator opening flow, entry layout, OpenAI model fallback, and agent updates |
| `7ca5b5b` | Fix session mismatch redirect loop on login |
| `edc1829` | Merge pull request #3 …（Safari セッション不整合・20 回リダイレクト問題） |
| `f0fc6cc` | Add Apple auth and Google Photos picker UI |
| `95deaba` | Merge pull request #4 …（Google Photos Picker、選択テーブル、Apple 再接続 UI） |
| `47e87dd` | Add Apple sign-in option to login UI |
| `6409c19` | Merge pull request #5 |
| `35898a7` | Show Apple login button even when auth is not configured |
| `dc3ab20` | Merge pull request #6 |

### `ebddfa2` — 統一検索とカレンダーキャッシュ検索

**規模**: 25 ファイル、+1107 / -208 行。

**DB**

- Prisma マイグレーション: カレンダーイベントの **ペイロード／検索用 blob** 関連（コミットメッセージ記載）

**サーバー**

- 新規 **`server/unified-search.ts`**（約 389 行）— エントリ・カレンダー・学校等を横断する検索の中核
- **`lib/google-event-snapshot.ts`**（約 204 行）— キャッシュイベントのスナップショット整形

**API / UI**

- **`/api/calendar/cached-event/[cacheId]`** — キャッシュ行からの取得
- **`search-panel.tsx`** — 検索 UI の整理・強化
- `search-client.tsx` 大幅整理
- `calendar-client.tsx`、`calendar/[date]/page.tsx` の追従
- `onboarding` の微調整、`proxy.ts`、`require-session.ts` の整合
- `embeddings.ts`、`journal.ts`、`calendar.ts` の追従
- **`web/scripts/fix-schema-comments.mjs`** — Prisma コメント整備用ユーティリティ

### `ed42c52` — オーケストレーターオープニング、エントリレイアウト、モデルフォールバック

- オープニング生成のフロー改善（前コミットの検索・キャッシュと組み合わさる）
- エントリページのレイアウト調整
- **OpenAI モデルフォールバック**（利用可能モデル差異への耐性）
- 各エージェント実装の追従更新

### セッション不整合と Safari（`7ca5b5b` / `edc1829`）

- ログイン時の **セッション不一致によるリダイレクトループ** を修正
- PR #3: **Safari** で「20 回を超えるリダイレクト」問題の緩和（PR タイトル・説明より）

### Apple / Google Photos（`f0fc6cc` / `95deaba` / `47e87dd` / `35898a7` / `dc3ab20`）

- **Sign in with Apple** の統合と UI
- **Google Photos Picker** 連携、**選択結果テーブル**（DB 側の永続化）
- **Apple 再接続** UI（トークン失効時の再連携）
- ログイン画面に **Apple オプション** を追加（`47e87dd`）
- **認証未設定環境でも Apple ボタンを表示**（デモ／段階的ロールアウト向け、`35898a7`）
- PR #5/#6 でマージ完了

---

## 2026-04-20（月）

### コミット一覧

| ハッシュ | メッセージ |
|----------|------------|
| `c73490b` | feat(web): セキュリティレビュー、Plutchik、ローカルカレンダー、Googleフォト、MASメモリ、日記UI |
| `22ba67d` | docs: CHANGELOG に反映コミットハッシュを追記 |
| `2df2f2d` | docs: CHANGELOG のコミット参照を明確化 |
| `58fdecb` | docs: CHANGELOG のコミット記述を先端非依存に整理 |
| `aa2bb50` | docs: CHANGELOG を全日程で詳細化（日別・DB・API・運用） |

（このファイルの追記のみのコミットは、都度 `git log CHANGELOG.md` で確認してください。）

機能の本体は **`c73490b`**。`22ba67d`〜`58fdecb` は **本 CHANGELOG のメタ情報整備**、`aa2bb50` は **CHANGELOG 本文の全面拡張**（本リリースノート相当）。

### `c73490b` — 全体像（規模感）

- **114 ファイル**、+10775 / -1146 行規模の一括反映。
- 以降の節で **DB → API → サーバー → UI → プロンプト** の順に分解する。

---

### データベース（Prisma マイグレーション詳細）

#### `20260419180000_security_review`

**テーブル `security_reviews`**

| 列 | 役割 |
|----|------|
| `messageId` | 対象チャットメッセージ（**UNIQUE**、1 メッセージ 1 レビュー） |
| `userId` / `threadId` / `entryId` | スコープと追跡 |
| `severity` | 重大度 |
| `categories` | JSON 配列（分類タグ） |
| `model` | 判定に使ったモデル |
| `userFacingSummaryJa` / `internalNote` | ユーザー向け要約と内部メモ |
| `syncRuleTags` | 同期ルール用タグ（JSON） |
| `llmInvoked` / `replacedContent` | LLM 呼び出し有無・コンテンツ差し替え有無 |
| `createdAt` | 時刻 |

**インデックス**: `userId+createdAt`、`threadId+createdAt`。  
**FK**: `users`、`chat_messages`（CASCADE）。

#### `20260419190000_memory_subagent_counter`

- `usage_counters` に **`memory_sub_agent_calls`**（INT, default 0）を追加。  
- 目的: メモリ系サブエージェントの **日次 LLM 回数** を将来のレート制限に使う（SQL コメントより）。

#### `20260419200000_chat_thread_memory_backfill`

- `chat_threads` に  
  - `memory_chat_backfill_at`  
  - `memory_chat_backfill_msg_count`  
  を追加（同一スナップショットの再実行防止用。後続マイグレーションで camelCase に寄せる）。

#### `20260420000000_image_google_media_item_id`

- `images` に **`googleMediaItemId`**（TEXT, nullable）
- インデックス `(entryId, googleMediaItemId)` — エントリ単位での重複インポート検知等に利用可能。

#### `20260420103000_chat_thread_memory_backfill_camel`

- PostgreSQL の `DO $$ … $$` で **snake_case 列があれば RENAME**、なければ **camel 列を ADD**。
- 最終形: `memoryChatBackfillAt`, `memoryChatBackfillMsgCount`（Prisma の引用 camelCase と一致）。

#### `20260420110000_usage_counter_memory_subagent_camel`

- `memory_sub_agent_calls` → **`memorySubAgentCalls`** へリネーム、または存在しなければ追加（同上の idempotent パターン）。

#### `20260420120000_plutchik_emotion`

- `daily_entries` に  
  - **`plutchikAnalysis`** JSONB（8 感情のスコア等の構造化データ）  
  - **`dominantEmotion`** TEXT  
- インデックス: `(userId, dominantEmotion)` — ダッシュボードや一覧フィルタ向け。

#### `20260420160000_app_local_calendars`

**方針（SQL コメント）**: Google には同期しない **アプリ内専用** カレンダー。

| テーブル | 主な列 |
|----------|--------|
| `app_local_calendars` | `userId`, `name`, 時刻戳 |
| `app_local_calendar_events` | `calendarId`, `title`, `description`, `location`, `startIso`/`endIso`, `startAt`/`endAt`, 時刻戳 |

**インデックス**: ユーザー＋カレンダー、ユーザー＋`startAt`。  
**FK**: すべて `users` / `app_local_calendars` に CASCADE。

---

### 新規・拡張 API（ルートパス）

| パス | 役割 |
|------|------|
| `POST/GET …/api/internal/security-review` | 内部エージェント向けセキュリティレビュー実行（ガード付き） |
| `…/api/calendar/event` | ローカル／編集可能なカレンダーイベントの CRUD 系 |
| `…/api/calendar/local-calendars` | アプリ内カレンダー一覧・作成等 |
| `…/api/entries/[entryId]/plutchik-emotion` | Plutchik 感情の取得・更新 |
| `…/api/google-photos/preview` | ピッカー選択前後のプレビュー用 |
| `…/api/settings/memory/reconcile-chat` | チャットログと長期メモリの突き合わせ・修復 |

既存 API の**大きな変更**（非網羅）:

- `api/ai/orchestrator/chat`, `opening`, `journal-draft`, `meta`, `image-gen`
- `api/chat-messages/[messageId]`（編集・サニタイズ・セキュリティ連携）
- `api/entries/[entryId]`, `images`, `api/images/[imageId]`
- `api/settings/memory`, `api/google-photos/items`, `picker/session`
- 各 `api/ai/agents/*`（薄い追従が多数）

---

### サーバー・ライブラリ（要点）

| 領域 | ファイル例 | 内容 |
|------|------------|------|
| セキュリティ | `security-review-queue.ts`, `security-review-job.ts`, `security-review-config.ts`, `security-sync-rules.ts`, `internal-agent-guard.ts` | レビュー投入、非同期ジョブ、ルール同期、内部 API の認可 |
| MAS メモリ | `mas-memory.ts`（大規模更新） | 長期記憶の抽出・バックフィル・スレッド reconcile 等 |
| ローカルカレンダー | `app-local-calendar.ts`, `calendar.ts` | GCal とは独立した CRUD・クエリ |
| Google Photos | `google-photos.ts`, `google-photos-picker-client.ts`, `google-photos-entry-date.ts` | メディア ID、日付整合、ピッカー UI 連携 |
| チャット | `chat-assistant-sanitize.ts`, `chat-thread-security-notice.ts`, `chat/build-entry-chat-transcript.ts` | 表示前サニタイズ、注意書き、トランスクリプト構築 |
| 内省チャット | `reflective-chat-diary-nudge-rules.ts`, `reflective-chat-user-edit-regeneration.ts` | 日記へのナッジ、ユーザー編集後の再生成 |
| ジャーナル | `journal/ground-suggested-tags.ts`, `journal-composer.ts` | タグの根拠付け、作曲エージェント強化 |
| 画像 | `entry-image-limits.ts`, `entry-image-upload-client.ts` | 上限ポリシーとクライアントアップロード |
| 利用枠 | `usage.ts` | メモリサブエージェント等のカウンタ |
| DB | `db.ts` | 接続・トランザクション周りの追従 |

---

### フロントエンド（画面・コンポーネント）

| 区分 | 主なファイル |
|------|----------------|
| カレンダー | `calendar-event-edit-dialog.tsx`, `calendar-client.tsx`, `[date]/page.tsx` |
| エントリ | `entries-nav-layout-shell.tsx`, `entry-by-date-view.tsx`, `entry-title-with-edit.tsx`, `entry-ai-meta-buttons.tsx`, `entry-chat.tsx`, `entry-images.tsx`, `journal-draft-panel.tsx`（大規模）, `entry-actions.tsx`, `layout.tsx`, `page.tsx` |
| Plutchik | `plutchik-wheel.tsx`, `plutchik-dominant-chip.tsx`, `plutchik-entry-detail-mobile.tsx` |
| Google Photos | `google-photos-import-dialog.tsx` |
| 今日 | `today-main-grid.tsx`, `today/page.tsx`（`today-entry-detail-promo.tsx` は削除） |
| 設定 | `settings-form.tsx`, `settings-memory-panel.tsx`, `apple-reconnect.tsx`, `page.tsx` |
| 共通 | `responsive-dialog.tsx`, `main-layout-body.tsx`, `weather-am-pm-display.tsx`, `agent-persona-preferences.tsx` |

---

### プロンプト・エージェント定義

| ファイル | 用途 |
|----------|------|
| `prompts/agents/security-reviewer.md` | セキュリティレビュアー用システム指示 |
| `prompts/plutchik-emotion.md` | Plutchik 感情抽出 |
| `prompts/mas-memory-diary.md` | 日記ベースの記憶更新 |
| `prompts/mas-memory-chat-backfill.md` | チャット履歴からのバックフィル |
| `prompts/mas-memory-thread-reconcile.md` | スレッドと記憶の整合 |
| `prompts/mas-memory.md`, `orchestrator.md`, `journal-composer.md` | 既存プロンプトの追従 |

**コード側エージェント**: `lib/mas/agents/plutchik-emotion.ts`、`factory.ts` の登録、`openai-chat-models.ts` のモデル定義更新。

---

### インフラ・設定

- ルート `Dockerfile` / `web/Dockerfile` の微修正、`next.config.ts` の追従。
- `package.json` / `package-lock.json` の依存更新（機能追加に伴うパッケージ）。

---

### 利用者・運用への影響（チェックリスト）

1. **`cd web && npm run db:migrate`** — 上記 8 マイグレーションを必ず適用。
2. **内部セキュリティ API** — 本番では `internal-agent-guard` 相当の秘密・ヘッダを必ず設定。
3. **Google Photos** — `googleMediaItemId` を使うため、既存画像行は NULL のまま運用可能（新規インポートから埋まる）。
4. **Plutchik** — 既存エントリは分析 NULL。初回アクセスまたはバッチで段階的に埋められる設計を想定。

---

### 同日のドキュメント系コミット（`22ba67d`〜`aa2bb50`）

- `22ba67d`〜`58fdecb`: CHANGELOG 冒頭のコミット参照の書き方を調整し、**常に最新先端 SHA に追従する必要がない**読み方に変更。
- `aa2bb50`: 本ファイルを **2026-04-02〜04-20 の全日程**で再構成（日別詳細、マイグレーション列レベル、API 表、運用チェックリスト、空日の明示）。
- いずれも **アプリの実行時挙動には直接影響しない**（ドキュメントのみ）。

---

## 2026-04-21（火）〜 2026-04-27（月）

### リポジトリ上の活動

**この期間のコミットは `git log` 上にありません**（`origin/main` 先端は 2026-04-20 のまま）。

---

## 2026-04-28（火）

### 注記（コミットと作業ツリー）

- **コミット**: 本日付分のアプリ変更は、執筆時点では **リポジトリに未コミット**（作業ツリーのみ）。
- **`web/src/server/orchestrator.ts`**: 作業ツリーで「変更」に含まれるが、`git diff` では**行末（CRLF/LF）以外の差分は表示されない**状態。実質的なロジック変更がない可能性がある。

### 概要

公開向けの**マーケティング／法務ページ**、**ルートのランディング**、**PWA／favicon 用アイコン**、および **`SNAP_MARKETING_HOST` による正規ホストへの寄せ**を追加・変更する塊。

### 環境変数（`web/.env.example`）

- **`SNAP_MARKETING_HOST`**（任意）: 本番で `snap.yutok.dev` 等に公開 URL を揃える場合。`/home`・`/privacy`・`/terms` が別ホストから開かれたとき、**`https://<SNAP_MARKETING_HOST><path>` へリダイレクト**する旨をコメントで説明。ローカル（`localhost` / `127.0.0.1`）は対象外。

### プロキシ（`web/src/proxy.ts`）

- **マーケパス**: `/home`、`/privacy`、`/terms` を集合 `MARKETING_PATHS` で判定。
- **公開ランディング**: パス正規化後に **`/` または上記マーケパス**を `isPublicLanding` とし、未ログインでも **ログインへ飛ばさず `next()`**（ルート LP・法務ページの閲覧を許可）。
- **正規ホストリダイレクト**: `SNAP_MARKETING_HOST` が設定されているとき、マーケパスへ **`Host` が正規値以外**（かつ localhost 系以外）で来たリクエストを **`https://` ＋正規ホスト**へリダイレクト。
- **オンボーディング**: ログイン済み・オンボ未完了のとき、**公開ランディングはオンボード強制の例外**（`!isPublicLanding` のときだけ `/onboarding` へ）。

### ルートページ（`web/src/app/page.tsx`）

- 従来の **即時 `redirect("/today")` を廃止**。
- **`getResolvedAuthUser()`** で認証状態を判定: `ok` → `/today`、`session_mismatch` → `/login?error=session_mismatch`、それ以外 → **`<HomeLanding />`**（未ログイン向け LP）。
- **メタデータ**: タイトル・説明文を LP／ストア説明向けに明示。

### アプリシェル・PWA（`web/src/app/layout.tsx`, `web/public/manifest.webmanifest`）

- **`metadata.icons`**: `/brand/daily-snap-icon-192.png` を favicon／Apple タッチ向けに指定。
- **`manifest.webmanifest`**: 192 / 512 の PNG アイコンエントリを追加（`purpose: "any"`）。

### 静的アセット（`web/public/brand/`）

- **本番利用想定**: `daily-snap-icon-192.png`、`daily-snap-icon-512.png`、`daily-snap-icon-master.png`、`daily-snap-oauth-logo.png`（OAuth 同意画面・ヘッダー等）。
- **`proposals/`**: 複数案のアイコン・ロゴ（`a-open-book` / `b-bookmark` / `c-closed-book` / `d-page-fold` の 192/512/master）。デザイン検討用。

### マーケルートグループ（`web/src/app/(marketing)/`）

| パス | 内容 |
|------|------|
| `layout.tsx` | `metadataBase`（`NEXT_PUBLIC_APP_ORIGIN`）、タイトルテンプレート、OG 画像（512 アイコン）。子は **`MarketingSiteShell`** でラップ。 |
| `home/page.tsx` | 公開ホーム（コメント上 OAuth 同意・Search Console 用 URL 想定: `https://snap.yutok.dev/home`）。`MarketingHomeContent` を表示。 |
| `privacy/page.tsx` | **プライバシーポリシー**（最終更新 2026-04-28）。Google API User Data Policy への言及、取得情報の列挙など。 |
| `terms/page.tsx` | **利用規約**（最終更新 2026-04-28）。 |

### コンポーネント（`web/src/components/marketing/`）

- **`marketing-site-shell.tsx`**: ヘッダー（ロゴ・`/home` `/privacy` `/terms`・ログイン）、フッター、年表示付きコピーライト。
- **`marketing-home-content.tsx`**: LP 本文（キャッチ、はじめる／プライバシーへの CTA、規約リンク）。
- **`home-landing.tsx`**: ルート `/` 用。シェル＋`MarketingHomeContent`（`/home` と同じ公開向けコピー）。
- **`legal-contact-block.tsx`**: お問い合わせ（`legal-site.ts` の定数を表示）。

### 法務定数（`web/src/lib/marketing/legal-site.ts`）

- 運営者名、問い合わせメール、Google フォーム URL を **1 箇所に集約**（プライバシー／利用規約・連絡ブロックから参照）。

### 利用者・運用への影響

1. **本番でマーケ URL を 1 ホストに固定する場合**: `SNAP_MARKETING_HOST` を設定し、DNS／ロードバランサが別名で来ても正規ホストへ寄せられる。
2. **OAuth ブランディング**: 同意画面用ロゴは `daily-snap-oauth-logo.png` を想定。
3. **未コミット資産**: `public/brand` と `(marketing)` 一式は **コミット前**のため、デプロイ手順に含める場合はリポジトリへ取り込む必要がある。

### 振り返りチャット・オーケストレーター（追記・作業ツリー）

- **クライアント時刻**: `entry-chat` から `clientNow`（ISO）を開口・送信 API に付与。サーバー時刻から **±12 時間**を超える値は無視（`resolveOrchestratorClockNow`）。`runOrchestrator` は `clockNow` で壁時計・天気・太陽位相を統一。
- **Open-Meteo 現況**: `fetchOpenMeteoDayAmPm` と並列で `fetchOpenMeteoCurrent` を取り、`formatWeatherForPrompt` に **現況行**を追加（forecast 取得経路のみ）。
- **`query_weather`**: `formatWeatherToolReply` で、エントリが今日かつ **before_sunrise** または太陽位相 **unknown** のときツール応答末尾に断定抑制メモを付与。
- **極圏等 `unknown`**: `formatOrchestratorWallClockDaylightBlock` の英語指示を強化（明るさ・夜明けの断定禁止、壁時計のみ確実な根拠として扱う）。
- **開口の temperature**: `orchestratorOpeningSamplingParams` — 既定 **0.72**。環境変数 `OPENAI_ORCHESTRATOR_OPENING_TEMPERATURE` で変更、空/`omit` で未指定。**gpt-5 / o 系**は temperature を送らない（API 制約想定）。
- **静的プロフィール**: （前段の作業ツリー）`formatOrchestratorStaticProfileBlock` で時間割曜日抜粋などを system に注入、`orchestrator.md` に根拠範囲の節を追加 — 本 CHANGELOG では上記と合わせて参照。
- **開口の予定優先**: `scoreOpeningTopic` に **壁時計 `wallNow`** を渡し、スコアに **近接係数**（`opening-proximity.ts`）を掛け合わせ。戻り値 **`orderedEvIdx`** でカレンダー行の表示順を並べ替え。開口用に **`### 開口優先（カテゴリ系インパクト × 壁時計からの近さ）`** を system へ注入。
- **講義（時間割）**: 学生かつ今日のエントリで `formatTimetableNextFocusForOpeningJa` により **`## 時間割ベースのこの後の講義`** を追加（直近コマ列挙）。`buildReflectiveOpeningSystemInstruction` に **`hasTimetableLecturesToday`** を渡し、カレンダーだけに偏らない指示を追加。

---

## サマリー表（期間全体）

| 日付 | コミット数（目安） | 主テーマ |
|------|-------------------|----------|
| 04-02 | 2 | 初期 MVP、env 暗号化 |
| 04-03 | 0 | — |
| 04-04 | 0 | — |
| 04-05 | 2 | オンボーディング・学校・Refpro 取り込み |
| 04-06 | 2 | GCal キャッシュ、Refpro ignore 整理 |
| 04-07〜09 | 0 | — |
| 04-10 | 4 | オープニング分類、MAS、カレンダー UI 統合 |
| 04-11〜15 | 0 | — |
| 04-16 | 7 | Docker/Cloud Build、逆ジオコーディング |
| 04-17 | 5 | 認証（proxy/secureCookie）、MAS メモリ設定 |
| 04-18 | 5 | レスポンシブ・Playwright、access-control |
| 04-19 | 10 | 統一検索、オーケストレーター、Apple/Photos、Safari 修正 |
| 04-20 | 複数 | セキュリティレビュー、Plutchik、ローカル GCal、Photos、日記 UI、および同日の CHANGELOG 反復更新 |
| 04-21〜27 | 0 | — |
| 04-28 | 作業ツリー | 公開 LP／法務ページ、`SNAP_MARKETING_HOST`、PWA アイコン、`public/brand` |

---

## 参照コマンド集

```bash
# 日付付き一覧（マージ除外）
git log --date=short --format="%ad %h %s" --no-merges

# マージ含む時系列
git log --date=short --format="%ad %h %s"

# 特定日の詳細
git log --after=2026-04-19 --before=2026-04-21 --format=fuller
```

---
