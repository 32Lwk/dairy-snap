import { NextRequest, NextResponse } from "next/server";

/**
 * When `INTERNAL_API_SECRET` is set, direct `/api/ai/agents/*` calls must include matching
 * `x-internal-api-secret` (browser sessions alone are not enough).
 */
export function guardInternalAgentApi(req: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) return null;
  if (req.headers.get("x-internal-api-secret") !== secret) {
    return NextResponse.json({ error: "このエンドポイントは内部用です" }, { status: 403 });
  }
  return null;
}
