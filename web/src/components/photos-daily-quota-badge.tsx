const TOKYO_ZONE = "Asia/Tokyo";

export function PhotosDailyQuotaBadge({
  remaining,
  dailyLimit,
}: {
  remaining: number;
  dailyLimit: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      <span>写真: あと {remaining} / {dailyLimit} 枚</span>
    </div>
  );
}
