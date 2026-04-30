import { handlers } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const { GET: authGET, POST: authPOST } = handlers;

const noStoreJson = {
  headers: {
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  },
} as const;

/**
 * Auth.js 内部や開発時のコンパイル競合で空ボディ等が返り JSON パースに失敗することがある。
 * その場合も HTML エラーページではなく JSON を返し、SessionProvider の ClientFetchError を抑える。
 */
export async function GET(req: NextRequest) {
  try {
    return await authGET(req);
  } catch (err) {
    console.error("[api/auth] GET", err);
    return NextResponse.json(
      {
        message:
          "セッションの取得に失敗しました。少し待ってから再読み込みするか、開発時はサーバーのコンパイル完了を待ってください。",
      },
      { status: 500, ...noStoreJson },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await authPOST(req);
  } catch (err) {
    console.error("[api/auth] POST", err);
    return NextResponse.json(
      { message: "認証の処理に失敗しました。しばらくしてから再度お試しください。" },
      { status: 500, ...noStoreJson },
    );
  }
}
