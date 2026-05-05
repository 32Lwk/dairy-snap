"use client";

import { signIn } from "next-auth/react";

/**
 * サーバー Action の signIn だと Next が OAuth URL を fetch しようとして失敗することがあるため、
 * ブラウザ全体で Google へ遷移する next-auth/react を使う。
 */
export function CalendarReconnectButton() {
  return (
    <div className="mt-0">
      <button
        type="button"
        className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:px-4 sm:py-2.5 sm:text-sm lg:py-3"
        onClick={() =>
          void signIn(
            "google",
            { callbackUrl: "/settings" },
            { prompt: "consent", access_type: "offline" },
          )
        }
      >
        Google を再連携（カレンダー権限を含む）
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-xs">
        初回ログインやスコープ追加後は、Google がリフレッシュトークンを返さないことがあります。
        このボタンはブラウザで同意画面を開き、取得したトークンをアカウントに保存します。
      </p>
    </div>
  );
}
