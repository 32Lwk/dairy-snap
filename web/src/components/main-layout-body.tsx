"use client";

import { usePathname } from "next/navigation";
import { AppBottomNav } from "@/components/app-bottom-nav";

export function MainLayoutBody({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hideBottomNav = path === "/onboarding" || path?.startsWith("/onboarding/");

  return (
    <div
      className={
        hideBottomNav
          ? "flex min-h-full flex-col"
          : "flex min-h-full flex-col pb-20 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
      }
    >
      <main className="min-h-0 min-w-0 flex-1">{children}</main>
      {!hideBottomNav && <AppBottomNav />}
    </div>
  );
}
