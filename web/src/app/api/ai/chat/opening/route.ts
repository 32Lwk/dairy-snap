/**
 * 後方互換ルート: /api/ai/chat/opening → /api/ai/orchestrator/opening へ転送
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = "/api/ai/orchestrator/opening";

  const body = await req.text();
  return fetch(url.toString(), {
    method: "POST",
    headers: req.headers,
    body,
  });
}
