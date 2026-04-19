import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSecurityReviewJob } from "@/server/security-review-job";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  messageId: z.string().min(1),
  userId: z.string().min(1),
  threadId: z.string().min(1),
  entryId: z.string().min(1),
  runLlm: z.boolean(),
  syncRuleTags: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECURITY_WEBHOOK_SECRET?.trim();
  if (secret) {
    if (req.headers.get("x-internal-security-secret") !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await runSecurityReviewJob(parsed.data);
  return NextResponse.json({ ok: true });
}
