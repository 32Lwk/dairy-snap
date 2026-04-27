type Props = {
  /** 表示する正方形の辺の長さ（px）。`width` / `height` にそのまま渡します。 */
  size: number;
  className?: string;
  priority?: boolean;
};

/**
 * アプリのブランドアイコン（`public/brand/daily-snap-icon-512.png`）。
 * 512px 版を参照し、表示サイズは `size` で指定。`next/image` は使わず `<img>` で直配信します。
 */
export function BrandOAuthLogo({ size, className, priority }: Props) {
  /* `public` 直配信でオプティマイザ差異を避ける */
  return (
    // eslint-disable-next-line @next/next/no-img-element -- intentional static brand asset
    <img
      src="/brand/daily-snap-icon-512.png"
      alt="daily-snap"
      width={size}
      height={size}
      className={className}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
