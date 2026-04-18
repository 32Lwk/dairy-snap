import { AuthSessionProvider } from "@/components/auth-session-provider";
import { isAllowlistOpenAccess } from "@/lib/access-control";
import { GoogleSignInButton } from "./google-sign-in-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/";
  const sessionMismatch = sp.error === "session_mismatch";
  const openToAllGoogle = isAllowlistOpenAccess();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          daily-snap
        </h1>
        {sessionMismatch ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            サーバー上のユーザー情報とセッションが一致しませんでした（開発で DB をリセットした直後などに起きます）。
            下のボタンから<strong className="font-semibold">もう一度 Google でログイン</strong>してください。
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {openToAllGoogle
              ? "Google アカウントでログインすると利用できます。"
              : "個人用の日記です。ログイン後、許可リストに含まれないアカウントは利用できません。"}
          </p>
        )}

        <AuthSessionProvider>
          <div className="mt-6">
            <GoogleSignInButton callbackUrl={next} />
          </div>
        </AuthSessionProvider>
      </div>
    </div>
  );
}

