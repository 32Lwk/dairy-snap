/**
 * 後方互換レイヤー: クライアントからの既存 POST /api/ai/chat/opening リクエストを
 * 新しい MAS オーケストレーター /api/ai/orchestrator/opening へ転送する。
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.text().catch(() => "{}");
  const url = new URL(req.url);
  const orchestratorUrl = `${url.origin}/api/ai/orchestrator/opening`;

  return fetch(orchestratorUrl, {
    method: "POST",
    headers: req.headers,
    body,
  });
}
