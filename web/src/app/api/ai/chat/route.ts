/**
 * 後方互換レイヤー: クライアントからの既存 POST /api/ai/chat リクエストを
 * 新しい MAS オーケストレーター /api/ai/orchestrator/chat へ転送する。
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.text().catch(() => "{}");
  const url = new URL(req.url);
  const orchestratorUrl = `${url.origin}/api/ai/orchestrator/chat`;

  return fetch(orchestratorUrl, {
    method: "POST",
    headers: req.headers,
    body,
  });
}
