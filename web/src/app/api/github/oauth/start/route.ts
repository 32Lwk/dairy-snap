import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/env";
import { requireResolvedSession } from "@/lib/api/require-session";
import {
  GITHUB_OAUTH_AUTHORIZE,
  GITHUB_SCOPE_PRIVATE,
  GITHUB_SCOPE_PUBLIC,
} from "@/server/github/constants";

export const runtime = "nodejs";

function callbackRedirectUri(): string {
  const base = env.NEXT_PUBLIC_APP_ORIGIN.replace(/\/$/, "");
  return `${base}/api/github/oauth/callback`;
}

export async function GET(req: NextRequest) {
  if (!env.AUTH_GITHUB_ID?.trim() || !env.AUTH_GITHUB_SECRET?.trim()) {
    return NextResponse.json({ error: "GitHub OAuth が未設定です" }, { status: 503 });
  }

  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const mode = req.nextUrl.searchParams.get("mode") === "private" ? "private" : "public";
  const scope = mode === "private" ? GITHUB_SCOPE_PRIVATE : GITHUB_SCOPE_PUBLIC;

  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const c = await cookies();
  const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  c.set("gh_oauth_state", state, cookieBase);
  c.set("gh_oauth_verifier", verifier, cookieBase);
  c.set("gh_oauth_mode", mode, cookieBase);

  const url = new URL(GITHUB_OAUTH_AUTHORIZE);
  url.searchParams.set("client_id", env.AUTH_GITHUB_ID.trim());
  url.searchParams.set("redirect_uri", callbackRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scope);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");

  return NextResponse.redirect(url);
}

/** フォーム POST などでも同一フローで開始できるようにする */
export const POST = GET;
