"use client";

import { type ReactNode, useEffect, useRef } from "react";

type ResponsiveDialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Element id for aria-labelledby */
  labelledBy: string;
  dialogId?: string;
  /** パネル（section）に追加するクラス（例: 幅の拡大） */
  panelClassName?: string;
  /** z-index layer (default 50) */
  zClass?: string;
  /**
   * sheet: スマホ〜大きめノートPC幅までは下寄せのカード、2xl 以上は中央モーダル（既定）。
   * island: 全ブレークポイントで中央のカード（縦横に余白）。
   * sheetBottom: 常に画面下からのシート（lg でも中央モーダルにしない）。
   */
  presentation?: "sheet" | "island" | "sheetBottom";
};

function getFocusable(root: HTMLElement): HTMLElement[] {
  const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(sel)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * presentation=sheet: 下寄せ＋横余白（〜2xl 未満）／2xl 以上は中央モーダル。
 * presentation=sheetBottom: 全幅域で下シートのみ。
 * presentation=island: 全幅で中央のフローティングカード。
 * Focus trap（Tab）、Escape で閉じる、body スクロールとフォーカスを復元。
 */
export function ResponsiveDialog({
  open,
  onClose,
  children,
  labelledBy,
  dialogId = "responsive-dialog",
  panelClassName,
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
  const sheetBottom = presentation === "sheetBottom";

  const overlayClass = island
    ? `fixed inset-0 ${zClass} flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]`
    : sheetBottom
      ? `fixed inset-0 ${zClass} flex items-end justify-center overflow-y-auto bg-zinc-950/50 px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4`
      : `fixed inset-0 ${zClass} flex min-h-[100dvh] flex-col justify-end items-center overflow-y-auto bg-zinc-950/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 2xl:min-h-0 2xl:justify-center 2xl:items-center 2xl:p-4 2xl:pt-[max(1rem,env(safe-area-inset-top))] 2xl:pb-[max(1rem,env(safe-area-inset-bottom))]`;

  const panelBase = island
    ? "flex max-h-[min(90dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl outline-none ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10"
    : sheetBottom
      ? "mx-auto flex max-h-[min(92dvh,92svh)] w-full max-w-[min(96vw,56rem)] flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-950"
      : "mx-auto flex w-full max-w-3xl shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-950 max-h-[min(90dvh,92svh)] 2xl:max-h-[min(90dvh,52rem)]";
  const panelClass = [panelBase, panelClassName].filter(Boolean).join(" ");

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
