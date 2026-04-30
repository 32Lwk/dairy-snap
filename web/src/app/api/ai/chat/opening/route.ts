/**
 * 後方互換ルート: /api/ai/chat/opening → /api/ai/orchestrator/opening へ転送
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Cloud Run / Next standalone はコンテナ内 HTTP で待ち受ける。
  // 外部公開ドメインへ HTTPS で自己リクエストすると環境によっては
  // `ERR_SSL_WRONG_VERSION_NUMBER` になりうるため、ローカルループバックへ転送する。
  const port = process.env.PORT ?? "8080";
  const url = new URL("/api/ai/orchestrator/opening", `http://127.0.0.1:${port}`);

  const body = await req.text();

  // NOTE: req.headers をそのまま渡すと、環境によっては禁止ヘッダーにより fetch が例外で落ちる。
  // 認証に必要な cookie 等は残しつつ、hop-by-hop / 生成されるべきヘッダーは落とす。
  const inHeaders = req.headers;
  const headers = new Headers();
  const allow = new Set([
    "accept",
    "content-type",
    "cookie",
    "authorization",
    "x-correlation-id",
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-forwarded-host",
    "user-agent",
  ]);
  for (const [k, v] of inHeaders.entries()) {
    const key = k.toLowerCase();
    if (!allow.has(key)) continue;
    headers.set(k, v);
  }

  try {
    return await fetch(url.toString(), {
      method: "POST",
      headers,
      body,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "転送に失敗しました", detail: msg.slice(0, 300) }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
