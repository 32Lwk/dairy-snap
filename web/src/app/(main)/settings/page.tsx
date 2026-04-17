import Link from "next/link";
import { redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { getCalendarConnectionSummary } from "@/server/calendar";
import { CalendarReconnectButton } from "./calendar-reconnect";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const cal = await getCalendarConnectionSummary(r.user.id);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">設定</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        暗号化モード・AI 上限・プロンプト版の参照（MVP）
      </p>

      <section className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Google カレンダー</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          AI の質問文脈と「予定を確認」に使います（未来30日・読み取りのみ）。再ログインで Google が
          refresh_token を返さない場合でも、既存トークンが消えないよう補正しています。取得できないときは下の再連携を試してください。
        </p>
        <ul className="mt-3 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
          <li>Google 連携: {cal.hasGoogleAccount ? "あり" : "なし"}</li>
          <li>リフレッシュトークン: {cal.hasRefreshToken ? "保存済み" : "未保存（再連携が必要なことがあります）"}</li>
          <li>カレンダー読み取りスコープ: {cal.hasCalendarReadonlyScope ? "付与済み" : "未確認（再連携推奨）"}</li>
        </ul>
        <CalendarReconnectButton />
      </section>

      <div className="mt-8">
        <SettingsForm userId={r.user.id} />
      </div>
      <p className="mt-8 text-sm">
        <Link href="/settings/bb84" className="text-blue-600 hover:underline dark:text-blue-400">
          BB84 鍵共有シミュレーション（学習用）
        </Link>
      </p>
    </div>
  );
}
