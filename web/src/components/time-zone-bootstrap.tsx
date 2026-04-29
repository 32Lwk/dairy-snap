"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * プロフィールに IANA タイムゾーンが未設定のとき、ブラウザの TZ を 1 回だけサイレント PATCH する。
 */
export function TimeZoneBootstrap() {
  const { status } = useSession();
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (ranRef.current) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/settings?_=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const j = (await res.json().catch(() => ({}))) as { profile?: { timeZone?: string } };
        if (!res.ok || cancelled) return;
        const cur = j.profile?.timeZone;
        if (typeof cur === "string" && cur.trim() !== "") return;

        ranRef.current = true;
        const patch = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ profile: { timeZone: tz } }),
        });
        if (!patch.ok) {
          ranRef.current = false;
          return;
        }
        router.refresh();
      } catch {
        ranRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  return null;
}
