import { MarketingHomeContent } from "@/components/marketing/marketing-home-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ホーム",
  description:
    "daily-snap は個人向けの日記サービスです。写真・天気・Google カレンダーと組み合わせて毎日を記録できます。",
};

/** OAuth 同意画面・Search Console 用の公開 URL: https://snap.yutok.dev/home */
export default function MarketingHomePage() {
  return <MarketingHomeContent />;
}
