"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserProfileForm, type UserProfilePayload } from "@/components/user-profile-form";
import { emitLocalSettingsSavedFromJson, REMOTE_SETTINGS_UPDATED_EVENT } from "@/lib/settings-sync-client";
import { hydrateProfilePayloadForForms } from "@/lib/user-settings";
import { OnboardingChatFlow } from "./onboarding-chat-flow";
import {
  clearOnboardingSessionStorage,
  onboardingModeKey,
  onboardingProfileDraftKey,
} from "./onboarding-storage";

function loadStoredDraft(userId: string, initial: UserProfilePayload): UserProfilePayload | null {
  /** サーバーで完了済みなら下書きは破棄（他ブラウザで完了したあと Safari に古い session が残るのを防ぐ） */
  if (initial.onboardingCompletedAt) {
    try {
      sessionStorage.removeItem(onboardingProfileDraftKey(userId));
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    const raw = sessionStorage.getItem(onboardingProfileDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfilePayload>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rest = { ...(parsed as UserProfilePayload) };
    delete rest.onboardingCompletedAt;
    return { ...initial, ...rest };
  } catch {
    return null;
  }
}

function loadStoredMode(userId: string): "chat" | "form" | null {
  try {
    const m = sessionStorage.getItem(onboardingModeKey(userId));
    if (m === "form" || m === "chat") return m;
    return null;
  } catch {
    return null;
  }
}

function persistDraft(userId: string, draft: UserProfilePayload) {
  try {
    sessionStorage.setItem(onboardingProfileDraftKey(userId), JSON.stringify(draft));
  } catch {
    /* quota */
  }
}

export function OnboardingClient({
  userId,
  initialProfile,
  isAllowed,
}: {
  userId: string;
  initialProfile: UserProfilePayload;
  /** 許可リスト外のとき完了後は /forbidden へ */
  isAllowed: boolean;
}) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** GET /api/settings が 401（セッションと DB の不一致）のとき */
  const [sessionAuthError, setSessionAuthError] = useState<string | null>(null);
  /** SSR と初回クライアントの DOM を一致させる（session はマウント後に読む） */
  const [draft, setDraft] = useState<UserProfilePayload>(() =>
    hydrateProfilePayloadForForms({ ...initialProfile }),
  );
  const [mode, setMode] = useState<"chat" | "form">("chat");
  const [formMountKey, setFormMountKey] = useState(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /**
   * マウント時に API の profile を正とする（RSC と別ブラウザ完了の取り違え対策）。
   * 他ブラウザで保存済みなら session 下書きを捨てて /today へ。
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/settings?_=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as {
        profile?: UserProfilePayload;
        error?: string;
      } | null;
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 401) {
          setSessionAuthError(
            typeof json?.error === "string"
              ? json.error
              : "セッションが無効です。再ログインしてください。",
          );
        }
        return;
      }
      if (!json) return;
      const serverProfile = json.profile ?? {};
      if (serverProfile.onboardingCompletedAt) {
        clearOnboardingSessionStorage(userId);
        router.replace(isAllowed ? "/today" : "/forbidden");
        router.refresh();
        return;
      }
      const loaded = loadStoredDraft(userId, serverProfile);
      setDraft(
        hydrateProfilePayloadForForms(
          loaded ?? { ...serverProfile },
        ),
      );
      const storedMode = loadStoredMode(userId);
      if (storedMode === "form") {
        setMode("form");
        setFormMountKey((k) => k + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, router, isAllowed]);

  /** リロード・タブ切替の直前に未フラッシュの変更を残さない（debounce 待ちを回避） */
  useEffect(() => {
    function flush() {
      persistDraft(userId, draftRef.current);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(onboardingModeKey(userId), mode);
    } catch {
      /* quota */
    }
  }, [userId, mode]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      persistDraft(userId, draft);
    }, 400);
    return () => window.clearTimeout(t);
  }, [userId, draft]);

  const patchDraft = useCallback((patch: Partial<UserProfilePayload>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  useEffect(() => {
    function onRemoteSettings() {
      void (async () => {
        const res = await fetch(`/api/settings?_=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => null)) as {
          profile?: UserProfilePayload;
          error?: string;
        } | null;
        if (!res.ok) {
          if (res.status === 401) {
            setSessionAuthError(
              typeof json?.error === "string"
                ? json.error
                : "セッションが無効です。再ログインしてください。",
            );
          }
          return;
        }
        if (!json?.profile) return;
        const serverProfile = json.profile;
        if (serverProfile.onboardingCompletedAt) {
          clearOnboardingSessionStorage(userId);
          router.push(isAllowed ? "/today" : "/forbidden");
          router.refresh();
          return;
        }
        const merged = hydrateProfilePayloadForForms({
          ...draftRef.current,
          ...serverProfile,
        });
        setDraft(merged);
        try {
          sessionStorage.setItem(onboardingProfileDraftKey(userId), JSON.stringify(merged));
        } catch {
          /* quota */
        }
      })();
    }
    window.addEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onRemoteSettings);
    return () => window.removeEventListener(REMOTE_SETTINGS_UPDATED_EVENT, onRemoteSettings);
  }, [userId, router, isAllowed]);

  async function skip() {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "プロフィール入力をスキップしてもよいですか？\nあとから設定画面で登録できます。",
      );
      if (!ok) return;
    }
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
      emitLocalSettingsSavedFromJson(json);
      clearOnboardingSessionStorage(userId);
      router.push(isAllowed ? "/today" : "/forbidden");
      router.refresh();
    } finally {
      setSkipping(false);
    }
  }

  function goToday() {
    clearOnboardingSessionStorage(userId);
    router.push(isAllowed ? "/today" : "/forbidden");
    router.refresh();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 pt-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">初回のみ</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">プロフィール</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 pt-7">
          <button
            type="button"
            disabled={skipping}
            onClick={() => void skip()}
            className="whitespace-nowrap text-right text-sm text-zinc-500 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
          >
            {skipping ? "処理中…" : "スキップ"}
          </button>
          {isAllowed ? (
            <Link
              href="/settings"
              className="max-w-[11rem] text-right text-xs leading-snug text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
            >
              設定（カレンダー連携）
            </Link>
          ) : null}
        </div>
      </header>

      {sessionAuthError && (
        <div className="mt-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="leading-relaxed">{sessionAuthError}</p>
          <button
            type="button"
            className="mt-3 w-full rounded-lg bg-amber-900 px-3 py-2 text-center text-sm font-medium text-amber-50 hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
            onClick={() =>
              void signOut({ callbackUrl: "/login?error=session_mismatch" })
            }
          >
            ログアウトして再ログイン
          </button>
        </div>
      )}

      {error && <p className="mt-2 shrink-0 text-sm text-red-600">{error}</p>}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className={
            mode === "chat" ? "flex h-full min-w-0 w-full max-w-full flex-col" : "hidden"
          }
        >
          <OnboardingChatFlow
            userId={userId}
            draft={draft}
            onDraftChange={patchDraft}
            onDone={goToday}
            onOpenFormMode={() => {
              setFormMountKey((k) => k + 1);
              setMode("form");
            }}
            completeButtonLabel={isAllowed ? "保存して今日へ" : "保存して完了"}
          />
        </div>
        <div className={mode === "form" ? "flex h-full" : "hidden"}>
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className="shrink-0 text-left text-sm text-emerald-700 underline dark:text-emerald-400"
            >
              ← チャット形式に戻る（入力内容は引き継がれます）
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <UserProfileForm
                key={formMountKey}
                initial={hydrateProfilePayloadForForms(initialProfile)}
                value={draft}
                onValuesChange={setDraft}
                finalizeOnboarding
                onSaved={goToday}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
