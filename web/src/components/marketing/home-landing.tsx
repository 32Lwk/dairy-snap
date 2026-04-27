import { MarketingHomeContent } from "@/components/marketing/marketing-home-content";
import { MarketingSiteShell } from "@/components/marketing/marketing-site-shell";

/** ルート `/` 向け（未ログイン時）。`/home` と同じ公開向けコピーとサイト共通ヘッダー／フッターです。 */
export function HomeLanding() {
  return (
    <MarketingSiteShell>
      <MarketingHomeContent />
    </MarketingSiteShell>
  );
}
