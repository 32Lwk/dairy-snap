"use client";

import { type ReactNode, useEffect, useRef } from "react";

type ResponsiveDialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Element id for aria-labelledby */
  labelledBy: string;
  dialogId?: string;
  /** z-index layer (default 50) */
  zClass?: string;
  /**
   * sheet: mobile bottom sheet, md+ centered (default).
   * island: centered floating card at all breakpoints (vertical + horizontal inset).
   */
  presentation?: "sheet" | "island";
};

function getFocusable(root: HTMLElement): HTMLElement[] {
  const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(sel)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * presentation=sheet: mobile bottom sheet, md+: centered modal.
 * presentation=island: centered floating card at all breakpoints.
 * Focus trap (Tab), Escape to close, restores body scroll and previous focus.
 */
export function ResponsiveDialog({
  open,
  onClose,
  children,
  labelledBy,
  dialogId = "responsive-dialog",
  zClass = "z-50",
  presentation = "sheet",
}: ResponsiveDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusable(panel);
      (focusables[0] ?? panel).focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = getFocusable(panelRef.current);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    const el = prevFocusRef.current;
    if (el && typeof el.focus === "function") {
      window.setTimeout(() => el.focus(), 0);
    }
    prevFocusRef.current = null;
  }, [open]);

  if (!open) return null;

  const island = presentation === "island";

  const overlayClass = island
    ? `fixed inset-0 ${zClass} flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]`
    : `fixed inset-0 ${zClass} flex items-end justify-center bg-zinc-950/50 md:items-center md:justify-center md:overflow-y-auto md:p-4 md:pt-[max(1rem,env(safe-area-inset-top))] md:pb-[max(1rem,env(safe-area-inset-bottom))]`;

  const panelClass = island
    ? "flex max-h-[min(90dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl outline-none ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10"
    : "flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-950 md:mt-0 md:max-h-[min(90dvh,52rem)] md:rounded-2xl";

  return (
    <div
      className={overlayClass}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={panelClass}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
