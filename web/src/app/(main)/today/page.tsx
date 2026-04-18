import { formatYmdTokyo } from "@/lib/time/tokyo";
import { parseUserSettings } from "@/lib/user-settings";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";
import { upsertDailyEntryForTodayPage } from "@/server/ensure-daily-entry";
import { redirect } from "next/navigation";
import { TodayEntryDetailPromo } from "./today-entry-detail-promo";
import { TodayMainGrid } from "./today-main-grid";

export default async function TodayPage() {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const ymd = formatYmdTokyo();
  const [userSettingsRow, entry] = await Promise.all([
    prisma.user.findUnique({
      where: { id: r.user.id },
      select: { settings: true },
    }),
    upsertDailyEntryForTodayPage(r.user.id, ymd),
  ]);

  const prof = parseUserSettings(userSettingsRow?.settings ?? {}).profile;
  if (!prof?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const chatThread = entry?.chatThreads[0];

  return (
    <div className="mx-auto w-full px-4 pb-6 pt-[calc(4.5rem+env(safe-area-inset-top,0px))] md:max-w-5xl md:px-5 md:pt-[calc(4.75rem+env(safe-area-inset-top,0px))] lg:max-w-6xl lg:px-6">
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5 lg:max-w-6xl lg:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">今日</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {ymd}
            </h1>
          </div>
          <TodayEntryDetailPromo entryDateYmd={ymd} />
        </div>
      </header>

      <TodayMainGrid
        entryId={entry.id}
        initialThreadId={chatThread?.id ?? null}
        initialMessages={
          chatThread?.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })) ?? []
        }
        latitude={entry.latitude}
        longitude={entry.longitude}
        weatherJson={entry.weatherJson}
      />
    </div>
  );
}
