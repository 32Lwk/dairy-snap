# ADR 001: ToolFactCard（ツール事実の正規化）

## 状態

採用（実装: [`src/lib/tool-fact-card.ts`](../../src/lib/tool-fact-card.ts)）

## 背景

オーケストレーターに天気・カレンダー等をテキストで直注入すると、長期記憶と混線し、トークンも肥大化する。

## 決定

- 共通型 **ToolFactCard**: `source`（列挙） / `asOf`（暦日） / `confidence`（high|medium|low） / `payload`（短い record） / 任意 `citations`
- プロンプトには **JSON 配列**を `## 今日の参照事実（structured）` に載せ、人間可読サマリは別サブセクション
- 最大カード数・文字数は `clipToolFactCards` / `formatTodayReferentialFactsSection` で制限
- ダイジェストは `digestToolFactCards`（SHA-256）でログ・`TurnContextSnapshot` と突合

## 結果

- モデルへの「当日ファクト」の境界が明確になる
- ストレージ・ログで再現可能
