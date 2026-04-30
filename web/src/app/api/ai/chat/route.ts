/**
 * 後方互換ルート: /api/ai/chat → /api/ai/orchestrator/chat へ転送
 * クライアント側の URL を変更せずに MAS オーケストレーターを使用できる
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = "/api/ai/orchestrator/chat";

  const body = await req.text();
  return fetch(url.toString(), {
    method: "POST",
    headers: req.headers,
    body,
  });
}
