import Link from "next/link";

type Props = {
  variant: "today" | "entry";
  /** アプリの「今日」（日付境界適用後） */
  effectiveYmd: string;
  /** 壁時計・カレンダー上の暦日 */
  calendarYmd: string;
  className?: string;
};

/**
 * 日付境界により「エントリで開いている日」と「カレンダー上の今日」がずれるときの注意。
 */
export function DayBoundaryMismatchNotice({ variant, effectiveYmd, calendarYmd, className }: Props) {
  if (effectiveYmd === calendarYmd) return null;

  const baseCls =
    "max-w-xl text-[11px] leading-snug text-zinc-500 sm:text-xs sm:leading-relaxed dark:text-zinc-400";
  const wrapCls = className ? `${baseCls} ${className}` : baseCls;

  if (variant === "today") {
    return (
      <div className={wrapCls}>
        いま開いているのは{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveYmd}</span>{" "}
        の振り返りです（設定どおり「まだ前日の続き」）。カレンダーでは今日は{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{calendarYmd}</span> です。
        <Link
          href={`/entries/${calendarYmd}`}
          className="ml-1.5 font-medium text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          カレンダー上の「今日」のエントリを開く
        </Link>
      </div>
    );
  }

  return (
    <div className={wrapCls}>
      このエントリは{" "}
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveYmd}</span>{" "}
      向けの画面です（日付境界の設定により、アプリの「今日」と暦日がずれていることがあります）。いま暦上は{" "}
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{calendarYmd}</span> です。
      <Link
        href={`/entries/${calendarYmd}`}
        className="ml-1.5 font-medium text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        暦の今日のエントリへ
      </Link>
    </div>
  );
}
