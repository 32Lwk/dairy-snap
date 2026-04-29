import { getUserEffectiveDayContext } from "@/lib/server/user-effective-day";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { redirect } from "next/navigation";

/**
 * Bare `/calendar` and legacy `?ym=YYYY-MM` resolve to a dated URL (`/calendar/YYYY-MM-DD`)
 * for bookmarks, Back, and future master–detail.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const sp = await searchParams;
  const { effectiveYmd } = await getUserEffectiveDayContext(r.user.id);
  const today = effectiveYmd;

  if (sp.ym && /^\d{4}-\d{2}$/.test(sp.ym)) {
    const target = today.startsWith(sp.ym) ? today : `${sp.ym}-01`;
    redirect(`/calendar/${target}`);
  }

  redirect(`/calendar/${today}`);
}
