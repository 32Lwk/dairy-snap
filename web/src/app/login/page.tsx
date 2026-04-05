import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/";
  const sessionMismatch = sp.error === "session_mismatch";

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
            個人用の日記です。ログイン後、許可されていないアカウントは利用できません。
          </p>
        )}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: next });
          }}
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
          >
            Google でログイン
          </button>
        </form>
      </div>
    </div>
  );
}

