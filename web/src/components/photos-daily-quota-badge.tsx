const TOKYO_ZONE = "Asia/Tokyo";

export function PhotosDailyQuotaBadge({
  remaining,
  dailyLimit,
  resetAt,
}: {
  remaining: number;
  dailyLimit: number;
  resetAt: Date;
}) {
  const resetLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TOKYO_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(resetAt);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      <span>写真: あと {remaining} / {dailyLimit} 枚</span>
      <span className="text-zinc-500">次回リセット {resetLabel}</span>
    </div>
  );
}
