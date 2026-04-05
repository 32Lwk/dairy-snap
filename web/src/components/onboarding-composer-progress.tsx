"use client";

const MAIN_TOTAL = 10;

type Props = {
  /** 0..9 */
  mainStep: number;
  /** ステップ8のときの AI ウィザード内位置 0..10（未使用なら省略） */
  personaSubStep?: number;
  personaSubTotal?: number;
};

/**
 * オンボーディングチャットのコンポーザー最下部に常時表示する段階インジケータ
 */
export function OnboardingComposerProgress({ mainStep, personaSubStep, personaSubTotal = 11 }: Props) {
  const safeMain = Math.min(Math.max(mainStep, 0), MAIN_TOTAL - 1);
  const mainPct = ((safeMain + 1) / MAIN_TOTAL) * 100;
  const showPersona =
    mainStep === 8 && personaSubStep != null && personaSubStep >= 0 && personaSubStep < personaSubTotal;

  return (
    <div className="space-y-1 border-t border-zinc-200/90 pt-1.5 dark:border-zinc-700/90">
      <div className="space-y-1 rounded-md border border-zinc-200/80 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-700/80 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between gap-2 text-[10px] leading-none text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">プロフィール</span>
          <span className="tabular-nums">
            {safeMain + 1} / {MAIN_TOTAL}
          </span>
        </div>
        <div className="h-0.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-700/60">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-200 dark:bg-emerald-400"
            style={{ width: `${mainPct}%` }}
          />
        </div>
      </div>
      {showPersona ? (
        <div className="space-y-1 rounded-md border border-emerald-200/70 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-900/45 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between gap-2 text-[10px] leading-none text-emerald-900/90 dark:text-emerald-100/90">
            <span className="font-medium">AI との関わり方</span>
            <span className="tabular-nums">
              {personaSubStep! + 1} / {personaSubTotal}
            </span>
          </div>
          <div className="h-0.5 overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-900/50">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-200 dark:bg-emerald-400"
              style={{ width: `${((personaSubStep! + 1) / personaSubTotal) * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
