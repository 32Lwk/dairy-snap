import { MarketingSiteShell } from "@/components/marketing/marketing-site-shell";
import type { Metadata } from "next";
import type { ReactNode } from "react";

function safeMetadataBase() {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (!origin) return undefined;
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: {
    template: "%s — daily-snap",
    default: "daily-snap",
  },
  description: "気楽に書ける、個人向け日記。",
  icons: {
    icon: [{ url: "/brand/daily-snap-icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/brand/daily-snap-icon-512.png", sizes: "512x512" }],
  },
  openGraph: {
    images: [{ url: "/brand/daily-snap-icon-512.png", width: 512, height: 512 }],
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingSiteShell>{children}</MarketingSiteShell>;
}
