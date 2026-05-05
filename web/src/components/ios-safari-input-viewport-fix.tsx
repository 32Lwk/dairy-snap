"use client";

import { useEffect } from "react";

function isLikelyIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  // iPadOS 13+ may report as Mac; rely on touch points as well.
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const isWebKit = /AppleWebKit/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isAppleMobile && isWebKit;
}

function isTextLikeField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el || typeof el !== "object") return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  const t = (el.getAttribute("type") || "text").toLowerCase();
  // Treat most interactive input types as candidates; exclude obvious non-text.
  return !["button", "submit", "reset", "checkbox", "radio", "range", "file", "image", "color"].includes(t);
}

function setKeyboardVars() {
  const vv = window.visualViewport;
  if (!vv) return;
  const innerH = window.innerHeight;
  const vvH = vv.height;
  const vvTop = vv.offsetTop;
  const keyboard = Math.max(0, Math.round(innerH - vvH - vvTop));
  document.documentElement.style.setProperty("--ios-visual-viewport-height", `${Math.round(vvH)}px`);
  document.documentElement.style.setProperty("--ios-keyboard-height", `${keyboard}px`);
}

export function IosSafariInputViewportFix() {
  useEffect(() => {
    if (!isLikelyIosSafari()) return;

    const vv = window.visualViewport;
    const onViewport = () => {
      setKeyboardVars();
      // When viewport changes while an input is focused, keep it in view.
      const a = document.activeElement;
      if (isTextLikeField(a)) {
        // Avoid bouncing: only do a light scroll into view.
        window.requestAnimationFrame(() => {
          try {
            a.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          } catch {
            a.scrollIntoView(true);
          }
        });
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isTextLikeField(e.target)) return;
      // Give Safari a moment to show keyboard/candidate bar.
      window.setTimeout(() => {
        setKeyboardVars();
        try {
          (e.target as HTMLElement).scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        } catch {
          (e.target as HTMLElement).scrollIntoView(true);
        }
      }, 80);
    };

    const onFocusOut = () => {
      // Clear keyboard height quickly after dismiss.
      window.setTimeout(() => {
        const vvNow = window.visualViewport;
        if (!vvNow) return;
        if (vvNow.height >= window.innerHeight * 0.94) {
          document.documentElement.style.setProperty("--ios-keyboard-height", "0px");
        }
      }, 200);
    };

    setKeyboardVars();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onViewport);
    vv?.addEventListener("scroll", onViewport);
    window.addEventListener("orientationchange", onViewport);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onViewport);
      vv?.removeEventListener("scroll", onViewport);
      window.removeEventListener("orientationchange", onViewport);
    };
  }, []);

  return null;
}

