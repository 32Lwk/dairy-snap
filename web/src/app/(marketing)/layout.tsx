import { MarketingSiteShell } from "@/components/marketing/marketing-site-shell";
import { env } from "@/env";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_ORIGIN),
  title: {
    template: "%s — daily-snap",
    default: "daily-snap",
  },
  description: "気楽に書ける、個人向け日記。",
  openGraph: {
    images: [{ url: "/brand/daily-snap-icon-512.png", width: 512, height: 512 }],
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingSiteShell>{children}</MarketingSiteShell>;
}
