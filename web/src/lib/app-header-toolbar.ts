/**
 * 固定ヘッダー直下のメイン余白（ツールバー行 min-h-9 + pt/pb と整合）。
 * 設定・エントリ日付・カレンダーで揃える。
 */
export const APP_MAIN_PT_BELOW_FIXED_HEADER =
  "pt-[calc(4rem+env(safe-area-inset-top,0px))] md:pt-[calc(4.25rem+env(safe-area-inset-top,0px))]";

/**
 * アプリ共通：ヘッダー内1行ツールバー（設定ページと同一の pt/pb/gap で高さを統一）
 */
export const APP_HEADER_TOOLBAR_INNER =
  "mx-auto flex w-full min-w-0 items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6";

/** ツールバー右の h-9 ボタンと同じ行高（min-h-9）で揃える */
export const APP_HEADER_TITLE =
  "flex min-h-9 min-w-0 flex-1 items-center truncate text-xl font-bold leading-none text-zinc-900 dark:text-zinc-50";

/** 日付などモノスペース見出し用 */
export const APP_HEADER_TITLE_INLINE =
  "flex min-h-9 min-w-0 items-center truncate font-mono text-base font-semibold tabular-nums leading-none text-zinc-900 dark:text-zinc-50 sm:text-lg";

/** カレンダー等ヘッダー右の操作ボタン（見出し min-h-9 と一致） */
export const APP_HEADER_TOOLBAR_BUTTON =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium leading-none text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900";
