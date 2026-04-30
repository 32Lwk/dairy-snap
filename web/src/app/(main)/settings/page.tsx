import Link from "next/link";
import { redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { getCalendarConnectionSummary } from "@/server/calendar";
import { AppleReconnectButton } from "./apple-reconnect";
import { CalendarReconnectButton } from "./calendar-reconnect";
import { SettingsForm } from "./settings-form";

const CALENDAR_BODY =
  "AI の質問文脈と「予定を確認」に使います。アプリ内で予定を編集する場合は、再連携で編集スコープ（calendar.events）が必要です。うまく取得できないときは下の再連携を試してください。";

export default async function SettingsPage() {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const cal = await getCalendarConnectionSummary(r.user.id);
  const email = r.authSession.user?.email ?? null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg px-4 pb-10 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:max-w-2xl sm:px-6 md:max-w-3xl md:pb-12 md:pt-[calc(3.75rem+env(safe-area-inset-top,0px))] lg:max-w-4xl lg:px-10 xl:max-w-5xl 2xl:max-w-6xl">
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
        <div className="mx-auto flex w-full min-w-0 max-w-lg items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:max-w-2xl sm:px-6 md:max-w-3xl lg:max-w-4xl lg:px-10 xl:max-w-5xl 2xl:max-w-6xl">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold leading-none tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-3xl">
            設定
          </h1>
        </div>
      </header>

      <section className="mt-3 w-full min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-5 lg:mt-4 lg:p-6">
        <div className="lg:flex lg:items-start lg:gap-10 xl:gap-12">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 lg:text-base">
              Google カレンダー
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 lg:text-sm">
              {CALENDAR_BODY}
            </p>
            {email ? (
              <p className="mt-3 text-xs font-medium text-zinc-700 dark:text-zinc-200 lg:text-sm">
                ログイン中: <span className="font-semibold">{email}</span>
              </p>
            ) : null}

            {/* mobile/tablet: accordion for details */}
            <details className="mt-2 lg:hidden">
              <summary className="cursor-pointer select-none text-xs font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-200">
                詳細
              </summary>
              <ul className="mt-2 space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                <li>Google 連携: {cal.hasGoogleAccount ? "あり" : "なし"}</li>
                <li>
                  リフレッシュトークン:{" "}
                  {cal.hasRefreshToken ? "保存済み" : "未保存（再連携が必要なことがあります）"}
                </li>
                <li>
                  カレンダー読み取りスコープ:{" "}
                  {cal.hasCalendarReadonlyScope ? "付与済み" : "未確認（再連携推奨）"}
                </li>
                <li>
                  予定の編集スコープ（calendar.events）:{" "}
                  {cal.hasCalendarEventsWriteScope
                    ? "付与済み"
                    : "未付与（アプリ内で予定を編集する場合は再連携）"}
                </li>
                <li>
                  Photos Picker スコープ:{" "}
                  {cal.hasGooglePhotosPickerScope ? "付与済み" : "未確認（再連携推奨）"}
                </li>
              </ul>
            </details>

            {/* desktop: show all details（ログイン表示は上の段落と重複しないようここでは出さない） */}
            <ul className="mt-3 hidden space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 lg:block lg:text-sm">
              <li>Google 連携: {cal.hasGoogleAccount ? "あり" : "なし"}</li>
              <li>リフレッシュトークン: {cal.hasRefreshToken ? "保存済み" : "未保存（再連携が必要なことがあります）"}</li>
              <li>
                カレンダー読み取りスコープ:{" "}
                {cal.hasCalendarReadonlyScope ? "付与済み" : "未確認（再連携推奨）"}
              </li>
              <li>
                予定の編集スコープ（calendar.events）:{" "}
                {cal.hasCalendarEventsWriteScope ? "付与済み" : "未付与（アプリ内で予定を編集する場合は再連携）"}
              </li>
              <li>
                Photos Picker スコープ: {cal.hasGooglePhotosPickerScope ? "付与済み" : "未確認（再連携推奨）"}
              </li>
            </ul>
          </div>
          <div className="mt-5 shrink-0 border-t border-zinc-200/80 pt-5 dark:border-zinc-700/80 lg:mt-0 lg:w-72 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:w-80">
            <CalendarReconnectButton />
          </div>
        </div>
      </section>

      <section className="mt-3 w-full min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-5 lg:mt-4 lg:p-6">
        <div className="lg:flex lg:items-start lg:gap-10 xl:gap-12">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 lg:text-base">Apple 連携</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 lg:text-sm">
              Apple サインイン状態を管理します。カレンダー取得は Apple 側仕様のため、別途接続設定（CalDAV 等）が必要です。
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 lg:text-sm">
              <li>Apple OAuth 設定: {cal.appleAuthConfigured ? "有効" : "未設定（環境変数が必要）"}</li>
              <li>Apple アカウント連携: {cal.hasAppleAccount ? "あり" : "なし"}</li>
            </ul>
          </div>
          <div className="mt-5 shrink-0 border-t border-zinc-200/80 pt-5 dark:border-zinc-700/80 lg:mt-0 lg:w-72 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:w-80">
            <AppleReconnectButton disabled={!cal.appleAuthConfigured} hasAppleAccount={cal.hasAppleAccount} />
          </div>
        </div>
      </section>

      <div className="mt-4 w-full min-w-0 lg:mt-5">
        <SettingsForm userId={r.user.id} />
      </div>
      <p className="mt-4 text-sm lg:mt-5">
        <Link href="/settings/bb84" className="text-blue-600 hover:underline dark:text-blue-400">
          {"BB84 \u937e\u5171\u6709\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3\uff08\u5b66\u7fd2\u7528\uff09"}
        </Link>
      </p>
    </div>
  );
}
