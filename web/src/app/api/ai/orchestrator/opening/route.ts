import type { NextRequest } from "next/server";
import { postAiOpening } from "@/server/ai-opening-post";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return postAiOpening(req);
}
