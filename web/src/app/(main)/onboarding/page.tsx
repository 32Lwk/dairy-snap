import { redirect } from "next/navigation";
import { parseUserSettings } from "@/lib/user-settings";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { OnboardingClient } from "./onboarding-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const profile = parseUserSettings(r.user.settings).profile;
  if (profile?.onboardingCompletedAt) {
    redirect("/today");
  }

  return (
    <div className="mx-auto flex h-[100dvh] min-w-0 max-w-lg flex-col px-4">
      <OnboardingClient userId={r.user.id} initialProfile={profile ?? {}} />
    </div>
  );
}
