"use client";

import { signIn } from "next-auth/react";

export function AppleReconnectButton({
  disabled = false,
  hasAppleAccount = false,
}: {
  /** `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` が無いとき true（ログイン画面の Apple ボタンと同じ基準） */
  disabled?: boolean;
  /** 既に Apple アカウント行があるときラベルを「更新」寄りにする */
  hasAppleAccount?: boolean;
}) {
  const label = hasAppleAccount ? "Apple 連携を更新" : "Apple を連携";

  return (
    <div className="mt-0">
      <button
        type="button"
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 lg:py-3"
        onClick={() => void signIn("apple", { callbackUrl: "/settings" })}
        disabled={disabled}
        aria-disabled={disabled}
        title={disabled ? "Apple 連携はサーバーで未設定です（環境変数が必要）" : undefined}
      >
        {label}
      </button>
      <p className="mt-2 text-xs text-zinc-500">
        {disabled ? (
          <>
            サーバーに <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-[0.7rem] dark:bg-zinc-800">AUTH_APPLE_ID</code>{" "}
            と <code className="rounded bg-zinc-200/80 px-1 py-0.5 text-[0.7rem] dark:bg-zinc-800">AUTH_APPLE_SECRET</code>{" "}
            を設定すると利用できます。
          </>
        ) : (
          <>
            Apple でログインして連携します。Apple カレンダー同期は次段で接続設定（CalDAV）が必要です。
          </>
        )}
      </p>
    </div>
  );
}
