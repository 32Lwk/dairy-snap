import { redirect } from "next/navigation";
import { EntriesNavLayoutShell } from "@/components/entries-nav-layout-shell";
import { parseUserSettings } from "@/lib/user-settings";
import { ENTRIES_NAV_PAGE_SIZE, getRecentEntriesForNav } from "@/server/entries-nav";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";

export default async function EntriesLayout({ children }: { children: React.ReactNode }) {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const userSettingsRow = await prisma.user.findUnique({
    where: { id: r.user.id },
    select: { settings: true },
  });
  const prof = parseUserSettings(userSettingsRow?.settings ?? {}).profile;
  if (!prof?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const entries = await getRecentEntriesForNav(r.user.id);

  return (
    <EntriesNavLayoutShell entries={entries} navPageSize={ENTRIES_NAV_PAGE_SIZE}>
      {children}
    </EntriesNavLayoutShell>
  );
}
