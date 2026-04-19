"use client";

import { signIn } from "next-auth/react";

/** Same pattern as `CalendarReconnectButton`: client `signIn` avoids OAuth URL fetch issues from Server Actions. */
export function AppleSignInButton({
  callbackUrl,
  disabled = false,
}: {
  callbackUrl: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        onClick={() => void signIn("apple", { callbackUrl })}
        disabled={disabled}
        aria-disabled={disabled}
        title={disabled ? "Appleログインは現在未設定です" : undefined}
      >
        Apple でログイン
      </button>
      {disabled ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Apple ログインは現在準備中です。
        </p>
      ) : null}
    </div>
  );
}
