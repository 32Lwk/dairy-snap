import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_FORM_URL,
  LEGAL_OPERATOR_NAME,
} from "@/lib/marketing/legal-site";

export function LegalContactBlock() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">お問い合わせ</h2>
      <p className="text-zinc-600 dark:text-zinc-400">
        運営者: <strong className="font-medium text-zinc-800 dark:text-zinc-200">{LEGAL_OPERATOR_NAME}</strong>
      </p>
      <ul className="list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
        <li>
          メール:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </li>
        <li>
          フォーム:{" "}
          <a
            href={LEGAL_CONTACT_FORM_URL}
            className="font-medium underline-offset-4 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            お問い合わせフォーム（別タブで開きます）
          </a>
        </li>
      </ul>
    </section>
  );
}
