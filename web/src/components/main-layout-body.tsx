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
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(3.875rem+env(safe-area-inset-bottom,0px))]"
      }
    >
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      {!hideBottomNav && <AppBottomNav />}
    </div>
  );
}
