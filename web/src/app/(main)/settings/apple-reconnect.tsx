"use client";

import { signIn } from "next-auth/react";

export function AppleReconnectButton() {
  return (
    <div className="mt-0">
      <button
        type="button"
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 lg:py-3"
        onClick={() => void signIn("apple", { callbackUrl: "/settings" })}
      >
        Apple を連携
      </button>
      <p className="mt-2 text-xs text-zinc-500">
        Apple でログインして連携します。Apple カレンダー同期は次段で接続設定（CalDAV）が必要です。
      </p>
    </div>
  );
}
