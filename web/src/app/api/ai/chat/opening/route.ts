/**
 * 後方互換: `/api/ai/chat/opening` は `/api/ai/orchestrator/opening` と同一処理。
 * 以前は 127.0.0.1 への内部 fetch で転送していたが、本番で不安定になりうるため直接呼び出す。
 */
import type { NextRequest } from "next/server";
import { postAiOpening } from "@/server/ai-opening-post";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return postAiOpening(req);
}
