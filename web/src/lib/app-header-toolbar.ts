/**
 * 固定ヘッダー直下のメイン余白（ツールバー行 min-h-9 + pt/pb と整合）。
 * 設定・エントリ日付・カレンダーで揃える。
 */
export const APP_MAIN_PT_BELOW_FIXED_HEADER =
  "pt-[calc(4rem+env(safe-area-inset-top,0px))] md:pt-[calc(4.25rem+env(safe-area-inset-top,0px))]";

/**
 * 今日ページ max-lg：固定ヘッダー（`APP_MAIN_PT` 相当）＋`MainLayoutBody` の底ナビ予約（3.875rem＋safe-bottom）を除いたチャットペイン高。
 */
export const TODAY_MAX_LG_CHAT_PANE_HEIGHT =
  "max-lg:h-[calc(100dvh-4rem-3.875rem-1.5rem-var(--app-top-banner-h,0px)-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] md:max-lg:h-[calc(100dvh-4.25rem-3.875rem-1.5rem-var(--app-top-banner-h,0px)-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]";

/**
 * エントリ日・チャット列ラッパー（`EntryByDateMainGrid` 内）。
 * - max-md: ビューポートからヘッダー・底ナビ・セーフエリア・控え 1.25rem を引いた `h`/`min-h`（`flex-1` だと潰れるため `flex-none`）。
 * - md〜lg: 2 列時は同じ控えを `max-h` に反映。
 */
export const ENTRY_BY_DATE_CHAT_PANE_SHELL =
  [
    "max-md:flex-none max-md:shrink-0",
    "max-md:h-[calc(100dvh-3.75rem-3.875rem-1.25rem-var(--app-top-banner-h,0px)-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
    "max-md:min-h-[calc(100dvh-3.75rem-3.875rem-1.25rem-var(--app-top-banner-h,0px)-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
    "md:max-lg:min-h-0 md:max-lg:flex-1 md:max-lg:max-h-[calc(100dvh-3.875rem-3.875rem-1.25rem-var(--app-top-banner-h,0px)-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
    "lg:flex-1 lg:min-h-0 lg:h-auto lg:max-h-none",
  ].join(" ");

/**
 * エントリ日ページ用：ツールバー実高（約 3.75rem）＋わずかな余白。主文・一覧ドロワー・lg サイドバーを揃える。
 */
export const APP_MAIN_PT_BELOW_FIXED_HEADER_COMPACT =
  "pt-[calc(3.75rem+env(safe-area-inset-top,0px))] md:pt-[calc(3.875rem+env(safe-area-inset-top,0px))]";

/** 固定ヘッダー直下からドロワーを開始する場合の `top`（`APP_MAIN_PT_BELOW_FIXED_HEADER` と同じオフセット） */
export const APP_FIXED_HEADER_TOP_FOR_OVERLAY =
  "top-[calc(4rem+env(safe-area-inset-top,0px))] md:top-[calc(4.25rem+env(safe-area-inset-top,0px))]";

/** `APP_MAIN_PT_BELOW_FIXED_HEADER_COMPACT` と同じ基準のドロワー `top` */
export const APP_FIXED_HEADER_TOP_FOR_OVERLAY_COMPACT =
  "top-[calc(3.75rem+env(safe-area-inset-top,0px))] md:top-[calc(3.875rem+env(safe-area-inset-top,0px))]";

/**
 * エントリ一覧の `aside` が `lg:static` のとき、全幅固定ヘッダーと重ならないよう主文と同じ上余白を確保する。
 * （ビューポート幅 lg 以上では md も有効のため 4.25rem 側に揃える）
 */
export const APP_ENTRIES_NAV_SIDEBAR_LG_PT_BELOW_FIXED_HEADER =
  "lg:pt-[calc(4.25rem+env(safe-area-inset-top,0px))]";

/** コンパクト主文（エントリ日）と揃える lg サイドバー上余白 */
export const APP_ENTRIES_NAV_SIDEBAR_LG_PT_BELOW_FIXED_HEADER_COMPACT =
  "lg:pt-[calc(3.875rem+env(safe-area-inset-top,0px))]";

/** 上記オフセット分を除いたビューポート高（モバイル固定ドロワーの `h` / `max-h`） */
export const APP_FIXED_HEADER_SUBTRACT_FROM_100DVH =
  "h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))] max-h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))] md:h-[calc(100dvh-4.25rem-env(safe-area-inset-top,0px))] md:max-h-[calc(100dvh-4.25rem-env(safe-area-inset-top,0px))]";

/** `APP_FIXED_HEADER_TOP_FOR_OVERLAY_COMPACT` に対応するドロワー高 */
export const APP_FIXED_HEADER_SUBTRACT_FROM_100DVH_COMPACT =
  "h-[calc(100dvh-3.75rem-env(safe-area-inset-top,0px))] max-h-[calc(100dvh-3.75rem-env(safe-area-inset-top,0px))] md:h-[calc(100dvh-3.875rem-env(safe-area-inset-top,0px))] md:max-h-[calc(100dvh-3.875rem-env(safe-area-inset-top,0px))]";

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
