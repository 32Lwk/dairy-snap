"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { AccountTransferDialog } from "@/components/account-transfer-dialog";

type Props = {
  /** 省略時は `/api/account/me` で取得（許可リスト外の画面用） */
  email?: string | null;
};

export function SettingsAccountActions({ email: emailProp }: Props) {
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(() =>
    emailProp !== undefined ? (emailProp ?? null) : null,
  );
  const [emailLoading, setEmailLoading] = useState(emailProp === undefined);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState<null | "export" | "import">(null);

  useEffect(() => {
    if (emailProp !== undefined) {
      setResolvedEmail(emailProp ?? null);
      setEmailLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setEmailLoading(true);
      const r = await fetch("/api/account/me");
      const j = (await r.json().catch(() => ({}))) as { email?: string | null };
      if (!cancelled) {
        setResolvedEmail(typeof j.email === "string" ? j.email : null);
        setEmailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailProp]);

  async function handleLogout() {
    setError(null);
    setBusy("logout");
    try {
      await signOut({ redirectTo: "/login" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    if (!resolvedEmail) {
      setError("メールアドレスが取得できないため削除できません。サポートへお問い合わせください。");
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "削除に失敗しました");
        return;
      }
      setConfirmEmail("");
      await signOut({ redirectTo: "/login" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">アカウント</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ログアウトは、この端末・ブラウザのセッションを終了します。
      </p>

      <div className="mt-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void handleLogout()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
        >
          {busy === "logout" ? "ログアウト中…" : "ログアウト"}
        </button>
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">データの引き継ぎ</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          別のアカウントや別環境（検証→本番など）へデータを移すには、暗号化されたバンドル(.dsbundle)をエクスポートし、
          移行先のアカウントで再ログインしてからインポートしてください。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          パスフレーズを忘れるとバンドルは復号できません。安全な場所に控えてください。
          認証情報・セキュリティレビュー履歴などは引き継がれません。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTransferOpen("export")}
            disabled={busy !== null}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            データをエクスポート
          </button>
          <button
            type="button"
            onClick={() => setTransferOpen("import")}
            disabled={busy !== null}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
          >
            バンドルからインポート
          </button>
        </div>
      </div>

      {transferOpen !== null && (
        <AccountTransferDialog
          open={transferOpen !== null}
          mode={transferOpen}
          onClose={() => setTransferOpen(null)}
        />
      )}

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <h3 className="text-sm font-medium text-red-700 dark:text-red-400">アカウントの削除</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          アカウントを削除すると、日記・チャット・設定など当サービス上に保存されているデータが消去され、
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">元に戻せません</strong>。
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          下欄にログイン中のメールアドレス（
          <span className="font-mono">
            {emailLoading ? "読み込み中…" : (resolvedEmail ?? "—")}
          </span>
          ）をそのまま入力してから削除してください。
        </p>
        <label className="mt-2 block text-xs text-zinc-600 dark:text-zinc-400">
          確認用メールアドレス
          <input
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder={resolvedEmail ?? ""}
            disabled={emailLoading || !resolvedEmail || busy !== null}
          />
        </label>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={emailLoading || !resolvedEmail || busy !== null || !confirmEmail.trim()}
          onClick={() => void handleDeleteAccount()}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
        >
          {busy === "delete" ? "削除中…" : "アカウントを削除する"}
        </button>
      </div>
    </section>
  );
}
