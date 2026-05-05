"use client";

export function githubGrassLevel(count: number, monthMax: number): number {
  if (count <= 0) return 0;
  if (monthMax <= 0) return 1;
  const r = count / monthMax;
  if (r < 0.22) return 1;
  if (r < 0.48) return 2;
  if (r < 0.75) return 3;
  return 4;
}

export function GithubGrassStrip({
  level,
  className = "",
}: {
  level: number;
  className?: string;
}) {
  const label =
    level === 0
      ? "GitHub 活動なし"
      : level === 1
        ? "GitHub やや活動"
        : level === 2
          ? "GitHub 活動"
          : level === 3
            ? "GitHub よく活動"
            : "GitHub とても活動";
  // 活動なしは「土」っぽい見た目にして寂しさを減らす
  const glyph = level === 0 ? "🟫" : level === 1 ? "🌱" : level === 2 ? "🌿" : level === 3 ? "🌳" : "🌲";
  return (
    <div
      className={`mt-0.5 flex min-h-[1rem] items-end justify-end transition-transform duration-200 ease-out hover:scale-[1.04] ${className}`}
      aria-label={label}
      title={label}
    >
      <span
        className={[
          "select-none text-[11px] leading-none sm:text-xs",
          level === 0 ? "text-zinc-300 dark:text-zinc-600" : "text-emerald-600 dark:text-emerald-400",
        ].join(" ")}
      >
        {glyph}
      </span>
    </div>
  );
}
