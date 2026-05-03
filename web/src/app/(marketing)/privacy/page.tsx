import { LegalContactBlock } from "@/components/marketing/legal-contact-block";
import { LEGAL_OPERATOR_NAME } from "@/lib/marketing/legal-site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "daily-snap（個人向け日記サービス）のプライバシーポリシー。",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        本ポリシーは機能追加・法令改正に応じて変更される場合があります。変更後も本サービスを利用された場合、変更後のポリシーに同意したものとみなします。
      </p>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">最終更新: 2026年5月3日</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed sm:text-base">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">1. はじめに</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            本ポリシーは、daily-snap（以下「本サービス」）が、利用者の情報をどのように取り扱うかを説明するものです。本サービスは個人による運営です。運営者の氏名は
            <strong className="font-medium text-zinc-800 dark:text-zinc-200"> {LEGAL_OPERATOR_NAME} </strong>
            です。
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Google API から取得した利用者のデータ（Google ユーザーデータ）の本サービスによる利用・転送・保存は、
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="font-medium underline-offset-4 hover:underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              Google API Services User Data Policy
            </a>
            の制限付き使用要件を含め、同ポリシーに準拠します。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">2. 取得する情報</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            本サービスは、次の情報を、利用者の操作・設定・連携の範囲で取得し、サーバー側のデータベースおよびストレージに記録する場合があります。
          </p>
          <ul className="list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">アカウント情報</strong>
              ：Google または Apple 等の OAuth ログインに伴い提供されるメールアドレス、表示名、プロフィール画像 URL など
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">認証・連携トークン</strong>
              ：OAuth のアクセストークン・リフレッシュトークン等（Google カレンダー・Google フォト連携に必要な範囲）。設定により暗号化して保存する場合があります
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">日記（デイリーエントリ）</strong>
              ：日付、タイトル、本文、気分、位置情報（利用者が入力した場合）、天気に関する取得結果（外部の気象 API 応答のうち保存に必要な部分）、感情分析などの付随情報、暗号化方式に関する設定・メタデータ。利用者の設定により、本文等が暗号化された状態で保存される場合があります
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">追記・編集履歴</strong>
              ：日記への追記イベントとして記録されるテキスト断片
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">画像</strong>
              ：利用者がアップロードした画像、または本サービス内で生成した画像のファイルデータとメタデータ（形式、サイズ、解像度等）。Google
              フォトから取り込んだ場合は、重複防止等に必要な Google 側のメディア識別子を保存する場合があります
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Google カレンダー</strong>
              ：利用者が連携を許可した範囲で Google Calendar API から取得した予定の内容（タイトル、場所、説明、開始・終了時刻等）および同期状態のキャッシュ
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Google フォト</strong>
              ：ピッカー等で利用者が選択したメディアに関するメタデータ（識別子、参照用 URL、ファイル名、解像度、撮影日時等）
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">GitHub（任意連携）</strong>
              ：利用者が OAuth で許可した範囲で、GitHub API から取得したユーザー情報・イベント・コントリビューションカレンダー相当の情報。アクセストークンはサーバー側で暗号化して保存し、日次活動の要約や UI 表示用に最小限の形でデータベースに保持します。データ引き継ぎバンドルには含めません。
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">アプリ内カレンダー</strong>
              ：Google 以外に本サービス上だけで作成したカレンダーおよび予定
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">チャット</strong>
              ：本サービス内の AI チャット機能におけるメッセージ内容、スレッド情報、会話から抽出したメモ（構造化データ）
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">AI 処理に関する記録</strong>
              ：利用したモデル名、応答までの時間、トークン数の推定、生成・分類の補助データ、安全レビューの結果など
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">記憶・学習用データ</strong>
              ：会話や日記から要約・属性として保持する長期・短期のメモ、エージェントが保持する簡易プロファイル情報
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">ベクトル（埋め込み）</strong>
              ：検索・意味検索のために、テキスト等から計算したベクトルをデータベースに保存する場合があります
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">タグ・利用状況</strong>
              ：利用者が付与したタグ、日次の機能利用回数などの集計
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">監査・設定</strong>
              ：操作ログ、利用者ごとの設定（JSON 形式で保存される各種オプション）
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">3. 利用目的</h2>
          <ul className="list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
            <li>本サービス（日記の作成・閲覧・編集、画像の取り扱い、検索、PWA としての提供）の提供・維持</li>
            <li>Google カレンダー・Google フォト等、利用者が有効にした外部サービスとの連携</li>
            <li>AI による下書き・チャット・分類・要約・画像生成など、本サービス内で明示される機能の実行</li>
            <li>不正利用の防止、セキュリティ、障害対応、品質改善のための分析（個人を特定しない形での集計を含む）</li>
            <li>利用者からのお問い合わせへの対応</li>
            <li>法令または本ポリシーに基づく対応</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">4. 保存期間と削除</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            上記の情報は、原則として<strong className="font-medium text-zinc-800 dark:text-zinc-200">アカウントが存続する間</strong>
            保存されます。利用者は本サービス所定の手続き（アカウント削除。メールアドレスの確認を含む）により、データベース上の利用者に紐づく主要なデータの削除を求めることができます。画像ファイル等は、削除処理のあとストレージからベストエフォートで消去します。
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            バックアップやログに一定期間残存する可能性がある場合があります。法令により保存が義務付けられる場合は、その範囲で保存することがあります。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">5. 第三者への提供・委託</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            運営者は、次の事業者（以下は例示であり、インフラ構成の変更に伴い実際に利用する事業者・サービス名が変わる場合があります）に対し、上記の利用目的の範囲でデータの取り扱いを委託する、または API
            経由でデータを送信する場合があります。
          </p>
          <ul className="list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Google LLC</strong>
              ：ログイン、Google Calendar API、Google フォト関連 API 等。取得した Google ユーザーデータの取り扱いは前項のとおりです
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">OpenAI, LLC</strong>
              等: AI 推論のため、プロンプトとしてテキスト等が送信されます。同社のプライバシーポリシー等に従います
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">気象データの提供元</strong>
              （例: Open-Meteo）: 緯度経度・日付等に基づき天気情報を取得します。通常、氏名やメールアドレスを送信する必要はありません
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">データベース・ホスティング事業者</strong>
              ：PostgreSQL 等を提供するクラウドサービス上にデータが保存されます
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">オブジェクトストレージ事業者</strong>
              ：画像等をクラウドストレージに保存する構成の場合、その事業者のインフラ上にファイルが置かれます
            </li>
          </ul>
          <p className="text-zinc-600 dark:text-zinc-400">
            法令に基づく開示請求等の場合を除き、利用者の同意なく個人を特定できる情報を第三者に販売・貸与することはしません。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">6. Cookie・ローカルストレージ等</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            本サービスは、ログイン状態の維持のために Cookie（セッション Cookie 等）を使用します。PWA・オフライン利用のため、ブラウザの
            IndexedDB 等にデータを保存する場合があります。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">7. 利用者の権利</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            個人情報保護法その他の法令に基づき、開示・訂正・利用停止等を求める権利が認められる場合、お問い合わせ先にご連絡ください。本人確認のうえ、合理的な範囲で対応します。
          </p>
        </section>

        <LegalContactBlock />
      </div>
    </div>
  );
}
