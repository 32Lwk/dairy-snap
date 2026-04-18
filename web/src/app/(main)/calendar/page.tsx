import { formatYmdTokyo } from "@/lib/time/tokyo";
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
  const sp = await searchParams;
  const today = formatYmdTokyo();

  if (sp.ym && /^\d{4}-\d{2}$/.test(sp.ym)) {
    const target = today.startsWith(sp.ym) ? today : `${sp.ym}-01`;
    redirect(`/calendar/${target}`);
  }

  redirect(`/calendar/${today}`);
}
