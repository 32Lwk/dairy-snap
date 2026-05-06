/** DB に保存された `GitHubConnection.lastSyncError` を画面向けに変換する */

export type GithubSyncErrorDisplay = {
  title: string;
  body: string;
  technicalDetail: string | null;
};

export function formatGithubSyncErrorForDisplay(raw: string | null | undefined): GithubSyncErrorDisplay | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  if (t === "github_sync_partial_or_failed") {
    return {
      title: "同期がすべて完了しなかった可能性があります",
      body: "GitHub からの取得は一部成功したものの、カレンダー用データの保存に失敗した可能性があります。しばらくしてから「今すぐ同期」を試してください。繰り返す場合は「再接続」もお試しください。",
      technicalDetail: null,
    };
  }

  const lower = t.toLowerCase();
  const transactionTimedOut =
    lower.includes("expired transaction") ||
    lower.includes("rollback cannot be executed") ||
    (lower.includes("transaction") && lower.includes("timeout")) ||
    /\b5000\s*ms\b/.test(lower);

  if (transactionTimedOut || lower.includes("githubcontributionday")) {
    return {
      title: "同期に時間がかかりすぎました",
      body: "サーバーが一時的に混み合っているか、通信が遅延した可能性があります。まず「今すぐ同期」を再度お試しください。何度も失敗する場合は「再接続」で GitHub への許可を取り直してください。",
      technicalDetail: t,
    };
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return {
      title: "GitHub 側の利用制限に達しそうです",
      body: "しばらく時間をおいてから「今すぐ同期」を試してください。",
      technicalDetail: t.length > 200 ? t.slice(0, 200) + "…" : t,
    };
  }

  return {
    title: "GitHub の同期中に問題が発生しました",
    body: "まず「今すぐ同期」を試し、改善しない場合は「再接続」で再認可してください。",
    technicalDetail: t,
  };
}
