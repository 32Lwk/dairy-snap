"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import {
  LOCAL_SETTINGS_SAVED_EVENT,
  REMOTE_SETTINGS_UPDATED_EVENT,
  SETTINGS_SYNC_BROADCAST_CHANNEL,
} from "@/lib/settings-sync-client";

/**
 * 別ブラウザ（Safari ↔ Chromium）は BroadcastChannel 不可のためサーバーと定期突き合わせ。
 * タブが非表示でもポーリングは継続する（Cursor 使用中に Safari が裏で更新され、完了を取り逃さない）。
 */
const POLL_MS = 6_000;
/** Safari の pageshow / focus 連打で router.refresh が短時間に何度も走るのを抑える */
const REFRESH_MIN_INTERVAL_MS = 2_500;

export function SettingsSyncProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const lastTokenRef = useRef<string | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (status !== "authenticated") {
      lastTokenRef.current = null;
      return;
    }

    let cancelled = false;
    let visibilityDebounce: number | null = null;

    async function fetchToken(): Promise<string | null> {
      try {
        const res = await fetch(`/api/settings?syncCheck=1&_=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return null;
        const json = (await res.json().catch(() => null)) as { serverSyncToken?: string } | null;
        const t = json?.serverSyncToken;
        return typeof t === "string" && t.length > 0 ? t : null;
      } catch {
        return null;
      }
    }

    function onNewServerToken(t: string) {
      lastTokenRef.current = t;
      window.dispatchEvent(
        new CustomEvent(REMOTE_SETTINGS_UPDATED_EVENT, { detail: { serverSyncToken: t } }),
      );
      /** 設定ページ以外（/today 等）でもサーバー側のプロフィールを取り直す */
      const now = Date.now();
      if (now - lastRefreshAtRef.current >= REFRESH_MIN_INTERVAL_MS) {
        lastRefreshAtRef.current = now;
        router.refresh();
      }
    }

    function applyToken(t: string | null) {
      if (cancelled || !t) return;
      if (lastTokenRef.current === null) {
        lastTokenRef.current = t;
        return;
      }
      if (t !== lastTokenRef.current) {
        onNewServerToken(t);
      }
    }

    async function tickSync() {
      const t = await fetchToken();
      applyToken(t);
    }

    function scheduleImmediateSync() {
      if (visibilityDebounce != null) {
        window.clearTimeout(visibilityDebounce);
      }
      visibilityDebounce = window.setTimeout(() => {
        visibilityDebounce = null;
        void tickSync();
      }, 80);
    }

    void (async () => {
      const t = await fetchToken();
      if (cancelled || !t) return;
      lastTokenRef.current = t;
    })();

    const onLocal = (e: Event) => {
      const d = (e as CustomEvent<{ serverSyncToken?: string }>).detail;
      const t = d?.serverSyncToken;
      if (typeof t === "string" && t.length > 0) {
        lastTokenRef.current = t;
      }
    };
    window.addEventListener(LOCAL_SETTINGS_SAVED_EVENT, onLocal);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(SETTINGS_SYNC_BROADCAST_CHANNEL);
      bc.onmessage = (ev: MessageEvent<{ serverSyncToken?: string }>) => {
        const t = ev.data?.serverSyncToken;
        if (typeof t !== "string" || !t) return;
        if (t === lastTokenRef.current) return;
        onNewServerToken(t);
      };
    } catch {
      /* ignore */
    }

    const id = window.setInterval(() => {
      void tickSync();
    }, POLL_MS);

    document.addEventListener("visibilitychange", scheduleImmediateSync);
    window.addEventListener("focus", scheduleImmediateSync);
    window.addEventListener("online", scheduleImmediateSync);
    window.addEventListener("pageshow", scheduleImmediateSync);

    return () => {
      cancelled = true;
      if (visibilityDebounce != null) window.clearTimeout(visibilityDebounce);
      window.removeEventListener(LOCAL_SETTINGS_SAVED_EVENT, onLocal);
      document.removeEventListener("visibilitychange", scheduleImmediateSync);
      window.removeEventListener("focus", scheduleImmediateSync);
      window.removeEventListener("online", scheduleImmediateSync);
      window.removeEventListener("pageshow", scheduleImmediateSync);
      window.clearInterval(id);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, [status, router]);

  return <>{children}</>;
}
