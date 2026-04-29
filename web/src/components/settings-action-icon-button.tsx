import type { ButtonHTMLAttributes, ReactNode } from "react";

const base =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-60 dark:focus-visible:ring-emerald-500/40 dark:focus-visible:ring-offset-zinc-950 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

const variants = {
  outline:
    "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900",
  primary:
    "border border-transparent bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
} as const;

export type SettingsActionIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant: keyof typeof variants;
  /** ラベル（`aria-label` に使う。アイコンのみのときは必須推奨） */
  label: string;
  children: ReactNode;
  className?: string;
};

/** 設定などで並べる「正方形・高さ固定」のアイコンボタン。横並び時の高さぶれを防ぐ。 */
export function SettingsActionIconButton({
  variant,
  label,
  children,
  className = "",
  type = "button",
  ...rest
}: SettingsActionIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${base} ${variants[variant]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
