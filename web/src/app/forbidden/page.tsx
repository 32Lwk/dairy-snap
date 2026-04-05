import { SettingsAccountActions } from "@/components/settings-account-actions";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          アクセスが許可されていません
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          このアカウントは許可リストに含まれていないため、利用できません。
        </p>
        <div className="mt-6 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <SettingsAccountActions />
        </div>
      </div>
    </div>
  );
}
