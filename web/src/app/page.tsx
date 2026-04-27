import { HomeLanding } from "@/components/marketing/home-landing";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "daily-snap — 個人向け日記",
  description:
    "気楽に書ける個人向け日記。写真・天気・Google カレンダーと組み合わせて毎日を記録できます。プライバシーポリシーと利用規約をこのサイトからご確認いただけます。",
};

export default async function Home() {
  const r = await getResolvedAuthUser();
  if (r.status === "ok") redirect("/today");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");
  return <HomeLanding />;
}
