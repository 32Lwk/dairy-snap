"use client";

import { signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccountTransferDialog } from "@/components/account-transfer-dialog";
import { SimpleAccordion } from "@/components/simple-accordion";
import { GitHubLogoIcon } from "@/components/github-logo-icon";

type Props = {
  /** 省略時は `/api/account/me` で取得（許可リスト外の画面用） */
  email?: string | null;
};

type GithubScope = "public" | "private";

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
    avatarUrl?: string;
    scope?: string;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
    syncSuccessCount?: number;
    syncFailCount?: number;
  } | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubMsg, setGithubMsg] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState<false | GithubScope>(false);
  const [githubInfoOpen, setGithubInfoOpen] = useState(false);

  const loadGithub = useCallback(async () => {
    const r = await fetch("/api/github/status", { credentials: "same-origin" });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    setGithub({
      configured: j.configured === true,
      linked: j.linked === true,
      login: typeof j.login === "string" ? j.login : undefined,
      avatarUrl: typeof j.avatarUrl === "string" ? j.avatarUrl : undefined,
      scope: typeof j.scope === "string" ? j.scope : undefined,
      lastSyncAt: typeof j.lastSyncAt === "string" || j.lastSyncAt === null ? (j.lastSyncAt as string | null) : undefined,
      lastSyncError:
        typeof j.lastSyncError === "string" || j.lastSyncError === null
          ? (j.lastSyncError as string | null)
          : undefined,
      syncSuccessCount: typeof j.syncSuccessCount === "number" ? j.syncSuccessCount : undefined,
      syncFailCount: typeof j.syncFailCount === "number" ? j.syncFailCount : undefined,
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

  async function handleDisconnect() {
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
      setShowDisconnectConfirm(false);
      await loadGithub();
    } finally {
      setGithubBusy(false);
    }
  }

  const isPrivateScope = github?.scope?.includes("repo") ?? false;

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
          {/* GitHub ヘッダー */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
              <GitHubLogoIcon size={20} />
            </div>
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">GitHub 連携</h3>
            <button
              type="button"
              aria-label="GitHub 連携の詳細"
              onClick={() => setGithubInfoOpen((v) => !v)}
              className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="詳細"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </button>
          </div>

          {/* 詳細パネル（ヘッダー右の i で開閉） */}
          {githubInfoOpen ? (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">カレンダーの「草」表示</p>
                    <p className="mt-0.5 leading-relaxed">
                      GitHub のコントリビューションをカレンダーに重ねて表示します。濃いほど、その日の活動が多いイメージです。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      <span className="select-none text-[11px] leading-none text-zinc-300 dark:text-zinc-600">🟫</span>
                      <span className="text-zinc-500">活動なし</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="select-none text-[11px] leading-none text-emerald-600 dark:text-emerald-400">🌱</span>
                      <span className="text-zinc-500">少なめ</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="select-none text-[11px] leading-none text-emerald-600 dark:text-emerald-400">🌿</span>
                      <span className="text-zinc-500">ふつう</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="select-none text-[11px] leading-none text-emerald-600 dark:text-emerald-400">🌲</span>
                      <span className="text-zinc-500">多め</span>
                    </span>
                  </div>
                </div>

                <ul className="mt-1 list-disc space-y-2 pl-4 leading-relaxed">
                  <li>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">データの保存:</span>{" "}
                    GitHub トークンと取得データはこのサービスに保存されます。引き継ぎバンドルには含まれません。
                  </li>
                  <li>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">非公開コントリビューション:</span>{" "}
                    GitHub 側で「非公開コントリビューションを表示」がオフだと、草が薄く見えることがあります。
                  </li>
                  <li>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">同期タイミング:</span>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      <li>初回連携・再接続後は、自動同期が走り数分以内にカレンダーへ反映されます</li>
                      <li>カレンダー表示中など、必要に応じて自動で再同期されます</li>
                      <li>GitHub 側の混雑・制限により、反映が遅れる場合があります</li>
                    </ul>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          {githubMsg ? (
            <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">{githubMsg}</p>
          ) : null}

          {github.lastSyncError ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              <span className="font-medium">同期エラー:</span> {github.lastSyncError}
              <br />
              <span className="text-amber-700/70 dark:text-amber-300/70">再接続を試してください</span>
            </p>
          ) : null}

          {github.linked ? (
            <div className="mt-4 space-y-4">
              {/* 連携中アカウントカード */}
              <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950">
                <div className="absolute right-0 top-0 p-3 opacity-5">
                  <GitHubLogoIcon size={80} />
                </div>
                <div className="relative flex items-start gap-3">
                  {github.avatarUrl ? (
                    <img
                      src={github.avatarUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full border border-zinc-200 bg-white object-cover shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900">
                      <GitHubLogoIcon size={24} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      @{github.login ?? "—"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                        連携中
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65" />
                        </svg>
                        {isPrivateScope ? "プライベート含む" : "公開のみ"}
                      </span>
                    </div>
                    {github.lastSyncAt ? (
                      <p className="mt-1.5 text-[11px] text-zinc-400">
                        最終同期: {new Date(github.lastSyncAt).toLocaleString("ja-JP")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* アクションボタン群 */}
              <div className="flex flex-wrap items-center gap-2">
                {/* アクセス権変更ボタン（ドロップダウン風） */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowScopeModal(isPrivateScope ? "public" : "private")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    アクセス権を変更
                    <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                {/* 連携解除ボタン */}
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  disabled={githubBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  連携を解除
                </button>
              </div>

              {/* 詳細パネルはヘッダー直下へ移動 */}

              {/* 連携解除確認モーダル */}
              {showDisconnectConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-medium text-zinc-900 dark:text-zinc-50">GitHub 連携を解除しますか？</h4>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          連携を解除すると、カレンダーの「草」表示と GitHub 活動の要約機能が使えなくなります。
                          このアプリ内の GitHub データも削除されます。
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDisconnectConfirm(false)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDisconnect()}
                        disabled={githubBusy}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
                      >
                        {githubBusy ? "解除中…" : "解除する"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* アクセス権変更モーダル */}
              {showScopeModal !== false && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 text-xs shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">アクセス権の変更</h4>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      現在: {isPrivateScope ? "プライベートリポジトリ含む" : "公開リポジトリのみ"}
                    </p>

                    <div className="mt-4 space-y-2">
                      {/* 公開のみオプション */}
                      <a
                        href="/api/github/oauth/start?mode=public"
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          !isPrivateScope
                            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
                            : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        }`}
                        onClick={() => setShowScopeModal(false)}
                      >
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600">
                          {!isPrivateScope && (
                            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">公開リポジトリのみ</p>
                          <p className="text-xs text-zinc-500">プライベートリポジトリの活動は取得しません</p>
                        </div>
                      </a>

                      {/* プライベート含むオプション */}
                      <a
                        href="/api/github/oauth/start?mode=private"
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          isPrivateScope
                            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
                            : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        }`}
                        onClick={() => setShowScopeModal(false)}
                      >
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600">
                          {isPrivateScope && (
                            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">プライベートリポジトリも含む</p>
                          <p className="text-xs text-zinc-500">非公開のコミットや Issue もカレンダーに反映されます</p>
                        </div>
                      </a>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowScopeModal(false)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {/* 未連携状態 */}
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                カレンダーに GitHub の「草」（コントリビューション）を表示し、AI に開発活動の要約を読み込ませられます。
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <a
                  href="/api/github/oauth/start?mode=public"
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-all hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                >
                  <GitHubLogoIcon size={18} />
                  <span>GitHub と連携</span>
                  <span className="text-xs text-zinc-400">（公開のみ）</span>
                </a>
                <a
                  href="/api/github/oauth/start?mode=private"
                  className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg border border-emerald-600/70 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition-all hover:bg-emerald-100/90 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                >
                  <GitHubLogoIcon size={18} />
                  <span>GitHub と連携</span>
                  <span className="text-xs text-emerald-700/70 dark:text-emerald-300/70">（プライベート含む）</span>
                </a>
              </div>

              {/* 未連携時の詳細説明アコーディオン */}
              <SimpleAccordion
                title={<span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">詳細を見る</span>}
                titleClassName="py-2 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                contentClassName="pb-2"
              >
                <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-400">
                  <p className="leading-relaxed">
                    <strong className="text-zinc-800 dark:text-zinc-200">カレンダーの「草」表示:</strong>
                    {" "}GitHub のコントリビューション数をカレンダーに重ねて表示します。
                    開発活動の多い日が一目でわかります。
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-sm bg-zinc-200 dark:bg-zinc-800" />
                      <span className="text-[10px]">活動なし</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-sm bg-emerald-200" />
                      <span className="text-[10px]">低</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-sm bg-emerald-400" />
                      <span className="text-[10px]">中</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-sm bg-emerald-600" />
                      <span className="text-[10px]">高</span>
                    </div>
                  </div>
                  <p className="leading-relaxed">
                    <strong className="text-zinc-800 dark:text-zinc-200">AI 要約:</strong>
                    {" "}日記を書く際に、同日の GitHub 活動（コミット、PR、Issue）の要約を AI に読み込ませられます。
                  </p>
                </div>
              </SimpleAccordion>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-300 text-white dark:bg-zinc-700">
              <GitHubLogoIcon size={20} />
            </div>
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">GitHub</h3>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
            className="rounded-lg border border-zinc-300 px-3 py-1.5 whitespace-nowrap text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
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
