"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserProfileForm, type UserProfilePayload } from "@/components/user-profile-form";
import { OnboardingChatFlow } from "./onboarding-chat-flow";

export function OnboardingClient({ initialProfile }: { initialProfile: UserProfilePayload }) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "form">("chat");

  async function skip() {
    setSkipping(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeOnboardingSkipProfile: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "スキップに失敗しました");
        return;
      }
      router.push("/today");
      router.refresh();
    } finally {
      setSkipping(false);
    }
  }

  function goToday() {
    router.push("/today");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Google ログイン直後の任意プロフィールです。チャット風の質問に答えるか、下の一覧フォームで入力できます。後から
        <Link href="/settings" className="mx-1 text-emerald-700 underline dark:text-emerald-400">
          設定
        </Link>
        でも変更できます。
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {mode === "chat" ? (
        <OnboardingChatFlow onDone={goToday} onOpenFormMode={() => setMode("form")} />
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setMode("chat")}
            className="text-sm text-emerald-700 underline dark:text-emerald-400"
          >
            ← チャット形式に戻る
          </button>
          <UserProfileForm
            initial={initialProfile}
            finalizeOnboarding
            onSaved={goToday}
          />
        </div>
      )}

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="button"
          disabled={skipping}
          onClick={() => void skip()}
          className="text-sm text-zinc-500 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {skipping ? "処理中…" : "プロフィールをスキップしてはじめる"}
        </button>
      </div>
    </div>
  );
}
