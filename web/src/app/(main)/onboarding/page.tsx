import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });
  const profile = parseUserSettings(user?.settings ?? {}).profile;
  if (profile?.onboardingCompletedAt) {
    redirect("/today");
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">初回のみ</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">プロフィール</h1>
      <OnboardingClient initialProfile={profile ?? {}} />
      <p className="mt-8 text-center text-sm text-zinc-500">
        <Link href="/settings" className="text-emerald-700 underline dark:text-emerald-400">
          設定（カレンダー連携）
        </Link>
      </p>
    </div>
  );
}
