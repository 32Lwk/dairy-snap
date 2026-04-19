import Link from "next/link";
import { redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { getCalendarConnectionSummary } from "@/server/calendar";
import { CalendarReconnectButton } from "./calendar-reconnect";
import { SettingsForm } from "./settings-form";

const CALENDAR_BODY =
  "AI \u306e\u8cea\u554f\u6587\u8108\u3068\u300c\u4e88\u5b9a\u3092\u78ba\u8a8d\u300d\u306b\u4f7f\u3044\u307e\u3059\uff08\u672a\u676530\u65e5\u30fb\u8aad\u307f\u53d6\u308a\u306e\u307f\uff09\u3002\u518d\u30ed\u30b0\u30a4\u30f3\u3067 Google \u304c refresh_token \u3092\u8fd4\u3055\u306a\u3044\u5834\u5408\u3067\u3082\u3001\u65e2\u5b58\u30c8\u30fc\u30af\u30f3\u304c\u6d88\u3048\u306a\u3044\u3088\u3046\u88dc\u6b63\u3057\u3066\u3044\u307e\u3059\u3002\u53d6\u5f97\u3067\u304d\u306a\u3044\u3068\u304d\u306f\u4e0b\u306e\u518d\u9023\u643a\u3092\u8a66\u3057\u3066\u304f\u3060\u3055\u3044\u3002";

export default async function SettingsPage() {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const cal = await getCalendarConnectionSummary(r.user.id);

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg px-4 pb-10 pt-[calc(7.5rem+env(safe-area-inset-top,0px))] sm:max-w-2xl sm:px-6 md:max-w-3xl md:pb-12 md:pt-[calc(8rem+env(safe-area-inset-top,0px))] lg:max-w-4xl lg:px-10 xl:max-w-5xl 2xl:max-w-6xl">
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
        <div className="mx-auto w-full min-w-0 max-w-lg px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:max-w-2xl sm:px-6 md:max-w-3xl lg:max-w-4xl lg:px-10 lg:pb-8 xl:max-w-5xl 2xl:max-w-6xl">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-3xl">
            設定
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 lg:text-base">
            暗号化モード・AI 上限・プロンプト版の参照（MVP）
          </p>
        </div>
      </header>

      <section className="mt-8 w-full min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-5 lg:mt-10 lg:p-6">
        <div className="lg:flex lg:items-start lg:gap-10 xl:gap-12">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 lg:text-base">
              Google カレンダー
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 lg:text-sm">
              {CALENDAR_BODY}
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 lg:text-sm">
              <li>Google 連携: {cal.hasGoogleAccount ? "あり" : "なし"}</li>
              <li>リフレッシュトークン: {cal.hasRefreshToken ? "保存済み" : "未保存（再連携が必要なことがあります）"}</li>
              <li>
                カレンダー読み取りスコープ:{" "}
                {cal.hasCalendarReadonlyScope ? "付与済み" : "\u672a\u78ba\u8a8d\uff08\u518d\u9023\u643a\u63a8\u5968\uff09"}
              </li>
            </ul>
          </div>
          <div className="mt-5 shrink-0 border-t border-zinc-200/80 pt-5 dark:border-zinc-700/80 lg:mt-0 lg:w-72 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:w-80">
            <CalendarReconnectButton />
          </div>
        </div>
      </section>

      <div className="mt-8 w-full min-w-0 lg:mt-10">
        <SettingsForm userId={r.user.id} />
      </div>
      <p className="mt-8 text-sm lg:mt-10">
        <Link href="/settings/bb84" className="text-blue-600 hover:underline dark:text-blue-400">
          {"BB84 \u937e\u5171\u6709\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3\uff08\u5b66\u7fd2\u7528\uff09"}
        </Link>
      </p>
    </div>
  );
}
