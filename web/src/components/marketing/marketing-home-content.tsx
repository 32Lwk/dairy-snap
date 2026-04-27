import { BrandOAuthLogo } from "@/components/marketing/brand-oauth-logo";
import Link from "next/link";

/**
 * OAuth 同意画面・Search Console 用の公開ホーム（/home）と、ルート LP で共通の本文。
 */
export function MarketingHomeContent() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
        <BrandOAuthLogo
          size={120}
          className="h-[120px] w-[120px] rounded-[28px] object-contain shadow-sm"
          priority
        />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">daily-snap</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          気楽に書ける、個人向けの日記です。写真や天気、Google カレンダーと組み合わせて、毎日を手軽に残せます。
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white no-underline dark:bg-zinc-100 dark:text-zinc-900"
          >
            はじめる
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium no-underline dark:border-zinc-700"
          >
            プライバシーポリシー
          </Link>
        </div>
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
          サービス概要・データの取り扱いは{" "}
          <Link href="/privacy" className="font-medium underline-offset-4 hover:underline">
            プライバシーポリシー
          </Link>
          、利用条件は{" "}
          <Link href="/terms" className="font-medium underline-offset-4 hover:underline">
            利用規約
          </Link>
          をご覧ください。
        </p>
      </div>
    </div>
  );
}
