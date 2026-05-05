"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 上部に出る通知・バナー（無いときは null でOK） */
  banner: ReactNode;
  children: ReactNode;
  /**
   * `calc(100dvh-...)` などの補正に使う CSS 変数名。
   * 既定は `--app-top-banner-h`。
   */
  cssVarName?: `--${string}`;
};

export function TopBannerHeightProvider({ banner, children, cssVarName = "--app-top-banner-h" }: Props) {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [bannerH, setBannerH] = useState(0);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;

    const update = () => setBannerH(Math.max(0, Math.ceil(el.getBoundingClientRect().height)));
    update();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [banner]);

  const style = useMemo(() => ({ [cssVarName]: `${bannerH}px` }) as React.CSSProperties, [cssVarName, bannerH]);

  return (
    <div style={style} className="contents">
      <div ref={bannerRef}>{banner}</div>
      {children}
    </div>
  );
}

