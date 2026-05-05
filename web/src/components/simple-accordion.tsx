"use client";

import { useState, type ReactNode } from "react";

type SimpleAccordionProps = {
  title: string | ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
};

export function SimpleAccordion({
  title,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className = "",
  titleClassName = "",
  contentClassName = "",
}: SimpleAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? isOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setIsOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!resolvedOpen)}
        className={`flex w-full items-center justify-between gap-2 text-left transition-colors ${titleClassName}`}
      >
        <span className="flex-1">{title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-200 ${resolvedOpen ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {resolvedOpen && <div className={contentClassName}>{children}</div>}
    </div>
  );
}
