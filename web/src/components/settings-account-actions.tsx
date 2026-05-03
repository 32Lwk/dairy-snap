"use client";

import { signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccountTransferDialog } from "@/components/account-transfer-dialog";

type Props = {
  /** 省略時は `/api/account/me` で取得（許可リスト外の画面用） */
  email?: string | null;
};

export function SettingsAccountActions({ email: emailProp }: Props) {
  const searchParams = useSearchParams();
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(() =>
    emailProp !== undefined ? (emailProp ?? null) : null,
  );
  const [emailLoading, setEmailLoading] = useState(emailProp === undefined);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState<null | "export" | "import">(null);
  const [github, setGithub] = useState<{
    configured: boolean;
    linked: boolean;
    login?: string;
    scope?: string;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
  } | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubMsg, setGithubMsg] = useState<string | null>(null);

  const loadGithub = useCallback(async () => {
    const r = await fetch("/api/github/status", { credentials: "same-origin" });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    setGithub({
      configured: j.configured === true,
      linked: j.linked === true,
      login: typeof j.login === "string" ? j.login : undefined,
      scope: typeof j.scope === "string" ? j.scope : undefined,
      lastSyncAt: typeof j.lastSyncAt === "string" || j.lastSyncAt === null ? (j.lastSyncAt as string | null) : undefined,
      lastSyncError:
        typeof j.lastSyncError === "string" || j.lastSyncError === null
          ? (j.lastSyncError as string | null)
          : undefined,
    });
  }, []);

  useEffect(() => {
    if (emailProp !== undefined) {
      setResolvedEmail(emailProp ?? null);
      setEmailLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setEmailLoading(true);
      const r = await fetch("/api/account/me");
      const j = (await r.json().catch(() => ({}))) as { email?: string | null };
      if (!cancelled) {
        setResolvedEmail(typeof j.email === "string" ? j.email : null);
        setEmailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailProp]);

  useEffect(() => {
    void loadGithub();
  }, [loadGithub]);

  useEffect(() => {
    const g = searchParams.get("github");
    if (g === "connected" || g === "error" || g === "token_error" || g === "user_error") {
      void loadGithub();
      if (g === "connected") setGithubMsg("GitHub と連携しました。数分以内にカレンダーへ反映されます。");
      if (g === "error" || g === "token_error" || g === "user_error") {
        setGithubMsg("GitHub 連携に失敗しました。もう一度お試しください。");
      }
    }
  }, [searchParams, loadGithub]);

  async function handleLogout() {
    setError(null);
    setBusy("logout");
    try {
      await signOut({ redirectTo: "/login" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    if (!resolvedEmail) {
      setError("メールアドレスが取得できないため削除できません。サポートへお問い合わせください。");
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "削除に失敗しました");
        return;
      }
      setConfirmEmail("");
      await signOut({ redirectTo: "/login" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">アカウント</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ログアウトは、この端末・ブラウザのセッションを終了します。
      </p>

      <div className="mt-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void handleLogout()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
        >
          {busy === "logout" ? "ログアウト中…" : "ログアウト"}
        </button>
      </div>

      {github?.configured ? (
        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">GitHub</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            開発活動の要約やカレンダーの「草」表示に使います。トークンと取得データはこのサービスに保存され、データ引き継ぎバンドルには含まれません。
          </p>
          {githubMsg ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{githubMsg}</p> : null}
          {github.lastSyncError ? (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              同期エラー: {github.lastSyncError}（再接続を試してください）
            </p>
          ) : null}
          {github.linked ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                連携中: <span className="font-mono text-zinc-800 dark:text-zinc-200">@{github.login ?? "—"}</span>
                {github.lastSyncAt ? (
                  <span className="ml-2 text-zinc-500">
                    （最終同期: {new Date(github.lastSyncAt).toLocaleString("ja-JP")}）
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/api/github/oauth/start?mode=public"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                >
                  権限を「公開のみ」で付け直す
                </a>
                <a
                  href="/api/github/oauth/start?mode=private"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                >
                  プライベートを含む権限で付け直す
                </a>
                <button
                  type="button"
                  disabled={githubBusy}
                  onClick={() => {
                    void (async () => {
                      setGithubBusy(true);
                      setGithubMsg(null);
                      try {
                        const res = await fetch("/api/github/disconnect", {
                          method: "POST",
                          credentials: "same-origin",
                        });
                        if (!res.ok) {
                          setGithubMsg("切断に失敗しました");
                          return;
                        }
                        setGithubMsg("GitHub 連携を解除しました（このアプリ内の GitHub データも削除済み）。");
                        await loadGithub();
                      } finally {
                        setGithubBusy(false);
                      }
                    })();
                  }}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/50"
                >
                  {githubBusy ? "処理中…" : "連携を解除"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href="/api/github/oauth/start?mode=public"
                className="inline-flex justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
              >
                GitHub と連携（公開のみ）
              </a>
              <a
                href="/api/github/oauth/start?mode=private"
                className="inline-flex justify-center rounded-lg border border-emerald-600/70 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
              >
                GitHub と連携（プライベート含む）
              </a>
            </div>
          )}
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            GitHub プロフィールで非公開コントリビューションの表示設定がオフの場合、草が薄く見えることがあります。
          </p>
        </div>
      ) : (
        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">GitHub</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            この環境では GitHub 連携が未設定です（管理者向け: AUTH_GITHUB_ID / AUTH_GITHUB_SECRET）。
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">データの引き継ぎ</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          暗号化バンドル（.dsbundle）をエクスポートし、移行先で再ログインのうえインポートしてください。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          パスフレーズ喪失で復号不可。控えを保管してください。認証・レビュー履歴は含まれません。GitHub
          連携のトークン・同期データも含まれません。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTransferOpen("export")}
            disabled={busy !== null}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            データをエクスポート
          </button>
          <button
            type="button"
            onClick={() => setTransferOpen("import")}
            disabled={busy !== null}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            バンドルからインポート
          </button>
        </div>
      </div>

      {transferOpen !== null && (
        <AccountTransferDialog
          open={transferOpen !== null}
          mode={transferOpen}
          onClose={() => setTransferOpen(null)}
        />
      )}

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <h3 className="text-sm font-medium text-red-700 dark:text-red-400">アカウントの削除</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          アカウントを削除すると、日記・チャット・設定など当サービス上に保存されているデータが消去され、
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">元に戻せません</strong>。
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          下欄にログイン中のメールアドレス（
          <span className="font-mono">
            {emailLoading ? "読み込み中…" : (resolvedEmail ?? "—")}
          </span>
          ）をそのまま入力してから削除してください。
        </p>
        <label className="mt-2 block text-xs text-zinc-600 dark:text-zinc-400">
          確認用メールアドレス
          <input
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder={resolvedEmail ?? ""}
            disabled={emailLoading || !resolvedEmail || busy !== null}
          />
        </label>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={emailLoading || !resolvedEmail || busy !== null || !confirmEmail.trim()}
          onClick={() => void handleDeleteAccount()}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
        >
          {busy === "delete" ? "削除中…" : "アカウントを削除する"}
        </button>
      </div>
    </section>
  );
}
