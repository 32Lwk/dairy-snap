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
          : "flex min-h-full flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
      }
    >
      <main className="flex-1">{children}</main>
      {!hideBottomNav && <AppBottomNav />}
    </div>
  );
}
