import { LegalContactBlock } from "@/components/marketing/legal-contact-block";
import { LEGAL_OPERATOR_NAME } from "@/lib/marketing/legal-site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約",
  description: "daily-snap（個人向け日記サービス）の利用規約。",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        本規約は変更される場合があります。変更後に本サービスを利用したときは、変更後の規約に同意したものとみなします。
      </p>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">利用規約</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">最終更新: 2026年5月3日</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed sm:text-base">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第1条（適用）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            本規約は、daily-snap（以下「本サービス」）の利用条件を定めるものです。本サービスの利用者（以下「利用者」）は、本規約に同意のうえ本サービスを利用するものとします。
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            本サービスの運営者（以下「運営者」）は <strong className="font-medium text-zinc-800 dark:text-zinc-200">{LEGAL_OPERATOR_NAME}</strong>{" "}
            です。個人情報の取り扱いは、別途定めるプライバシーポリシーに従います。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第2条（アカウント）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            利用者は、Google または Apple 等、運営者が指定する方法でアカウントを登録・ログインします。運営者は、許可リスト方式等により、特定のメールアドレスのみ利用を認める設定を行う場合があります。
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            利用者は、自己の認証情報の管理責任を負い、第三者に利用させてはなりません。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第3条（本サービスの内容）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            本サービスは、個人向けの日記の作成・保存・閲覧、画像の添付、外部サービス（Google カレンダー・Google フォト等）との連携、任意の
            GitHub 連携、AI による補助機能などを提供します。機能の詳細・利用条件は、アプリ内表示および運営者が別途示す内容に従います。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第4条（禁止事項）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">利用者は、次の行為をしてはなりません。</p>
          <ul className="list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
            <li>法令または公序良俗に違反する行為</li>
            <li>運営者、他の利用者または第三者の権利を侵害する行為</li>
            <li>本サービスまたは関連インフラに不正にアクセスし、または過度な負荷を与える行為</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>その他、運営者が不適切と判断する行為</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第5条（コンテンツの権利）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            日記本文・画像など、利用者が本サービスに入力・アップロードしたコンテンツの著作権その他の権利は、利用者に帰属します。利用者は、本サービスの提供・改善・AI
            機能の実行に必要な範囲で、運営者に対し、当該コンテンツを複製・加工・解析等する非独占的な許諾を付与するものとします。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第6条（免責・サービスの変更等）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            本サービスは現状有姿で提供されます。運営者は、本サービスが利用者の特定の目的に適合すること、期待する機能・正確性・完全性が得られること、不具合が生じないことを保証しません。
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Google・OpenAI 等の第三者サービスの障害・仕様変更に起因する損害について、運営者に故意または重過失がある場合を除き、運営者は責任を負いません。運営者は、利用者への事前通知の有無にかかわらず、本サービスの内容を変更・中断・終了することがあります。
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            運営者の故意または重過失によらずに利用者に生じた損害について、運営者が負う賠償責任は、当該損害が発生した月に利用者が運営者に支払った対価額（無償の場合は金員 1,000
            円）を上限とします。ただし、運営者に故意または重過失がある場合はこの限りではありません。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">第7条（準拠法・管轄）</h2>
          <p className="text-zinc-600 dark:text-zinc-400">本規約は、日本法に準拠して解釈されます。</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            本サービスに関して紛争が生じた場合、運営者と利用者は誠意をもって協議するものとします。協議によって解決しない場合、日本国の裁判所を管轄裁判所とします。消費者契約法その他の強行法規により、利用者が優位に扱われるべき場合は、その限度においてこの取り決めに代わるものとします。
          </p>
        </section>

        <LegalContactBlock />
      </div>
    </div>
  );
}
