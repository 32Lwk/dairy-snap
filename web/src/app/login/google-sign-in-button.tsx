"use client";

import { signIn } from "next-auth/react";

/** Same pattern as `CalendarReconnectButton`: client `signIn` avoids OAuth URL fetch issues from Server Actions. */
export function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button
      type="button"
      className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
      onClick={() => void signIn("google", { callbackUrl })}
    >
      Google でログイン
    </button>
  );
}
