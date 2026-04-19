import { PLUTCHIK_COLOR, PLUTCHIK_LABEL_JA, safeParsePrimaryKey } from "@/lib/emotion/plutchik";

export function PlutchikDominantChip({ dominantKey }: { dominantKey: string | null }) {
  const key = safeParsePrimaryKey(dominantKey);
  if (!key) return null;
  const label = PLUTCHIK_LABEL_JA[key];
  const color = PLUTCHIK_COLOR[key];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="font-medium">感情</span>
      <span className="text-zinc-500 dark:text-zinc-400">:</span>
      <span>{label}</span>
    </span>
  );
}
