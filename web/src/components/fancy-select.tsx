"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export type FancySelectOption = {
  value: string;
  label: string;
};

type FancySelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue"> & {
  value?: string | number;
  defaultValue?: string | number;
  /** `select`互換（e.target.value を参照するコードを壊さない） */
  onChange?: SelectHTMLAttributes<HTMLSelectElement>["onChange"];
  /** こちらを使うと string で直接受け取れる */
  onValueChange?: (value: string) => void;
  /** `children <option>` でも、`options`配列でもOK */
  options?: FancySelectOption[];
  children?: ReactNode;
};

function optionsFromChildren(children: ReactNode): FancySelectOption[] {
  const out: FancySelectOption[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    // `<option value="x">Label</option>` を想定（optgroup は現状未使用）
    if (typeof child.type === "string" && child.type.toLowerCase() === "option") {
      const props = child.props as { value?: unknown; children?: ReactNode };
      const v = props.value == null ? "" : String(props.value);
      const label =
        typeof props.children === "string"
          ? props.children
          : Array.isArray(props.children)
            ? props.children.filter((x) => typeof x === "string").join("")
            : String(props.children ?? v);
      out.push({ value: v, label: label || v });
    }
  }
  return out;
}

export function FancySelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onValueChange,
  options,
  children,
  disabled,
  className,
  ...rest
}: FancySelectProps) {
  const autoId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = `${id ?? autoId}-listbox`;

  const [open, setOpen] = useState(false);
  const opts = useMemo(() => (options?.length ? options : optionsFromChildren(children)), [options, children]);
  const resolvedValue = useMemo(() => {
    const v = value ?? defaultValue ?? "";
    return String(v);
  }, [value, defaultValue]);
  const selected = useMemo(() => opts.find((o) => o.value === resolvedValue) ?? opts[0], [opts, resolvedValue]);
  const selectedIndex = useMemo(() => Math.max(0, opts.findIndex((o) => o.value === resolvedValue)), [opts, resolvedValue]);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!(e.target instanceof Node)) return;
      if (!root.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const baseButtonClass = [
    "flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-[13px] font-medium text-zinc-900 shadow-sm outline-none transition",
    "hover:bg-white focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-500/30",
    "dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-100 dark:hover:bg-zinc-950 dark:focus-visible:border-emerald-500 dark:focus-visible:ring-emerald-400/25",
    disabled ? "cursor-not-allowed opacity-50" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const listClass = [
    "absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl ring-1 ring-black/5",
    "dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10",
  ].join(" ");

  const optionBase =
    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium text-zinc-800 outline-none transition dark:text-zinc-100";
  const optionHover = "hover:bg-zinc-100 dark:hover:bg-zinc-900/70";
  const optionActive = "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={resolvedValue} /> : null}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        className={baseButtonClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") {
            if (open) e.preventDefault();
            setOpen(false);
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(opts.length - 1, i + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Home") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex(0);
            return;
          }
          if (e.key === "End") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex(opts.length - 1);
            return;
          }
        }}
      >
        <span className="min-w-0 truncate text-left">{selected?.label ?? ""}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div role="presentation" className={listClass}>
          <ul id={listId} role="listbox" aria-labelledby={id} className="space-y-0.5">
            {opts.map((opt, idx) => {
              const isSelected = opt.value === resolvedValue;
              const isActive = idx === activeIndex;
              const optionClass = [optionBase, optionHover, isSelected ? optionActive : "", isActive ? "ring-2 ring-emerald-500/30" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={optionClass}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      onValueChange?.(opt.value);
                      if (onChange) {
                        onChange({ target: { value: opt.value } } as unknown as Parameters<NonNullable<typeof onChange>>[0]);
                      }
                      setOpen(false);
                      window.setTimeout(() => buttonRef.current?.focus(), 0);
                    }}
                  >
                    <span className="min-w-0 truncate">{opt.label}</span>
                    {isSelected ? <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">選択中</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

