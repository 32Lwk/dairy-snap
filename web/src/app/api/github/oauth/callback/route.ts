import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";
import { requireResolvedSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import {
  GITHUB_API_BASE,
  GITHUB_OAUTH_ACCESS_TOKEN,
  GITHUB_SCOPE_PRIVATE,
  GITHUB_SCOPE_PUBLIC,
} from "@/server/github/constants";
import { saveGithubOAuthToken } from "@/server/github/token-store";
import { scheduleGithubSync } from "@/server/github/sync";

export const runtime = "nodejs";

function callbackRedirectUri(): string {
  const base = env.NEXT_PUBLIC_APP_ORIGIN.replace(/\/$/, "");
  return `${base}/api/github/oauth/callback`;
}

function settingsRedirect(path: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_ORIGIN.replace(/\/$/, "");
  return NextResponse.redirect(new URL(path, base));
}

export async function GET(req: NextRequest) {
  if (!env.AUTH_GITHUB_ID?.trim() || !env.AUTH_GITHUB_SECRET?.trim()) {
    return NextResponse.json({ error: "GitHub OAuth が未設定です" }, { status: 503 });
  }

  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  const c = await cookies();
  const qpState = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const st = c.get("gh_oauth_state")?.value;
  const verifier = c.get("gh_oauth_verifier")?.value;
  const mode = c.get("gh_oauth_mode")?.value === "private" ? "private" : "public";

  if (!code || !qpState || !st || qpState !== st || !verifier) {
    return settingsRedirect("/settings?github=error");
  }

  c.delete("gh_oauth_state");
  c.delete("gh_oauth_verifier");
  c.delete("gh_oauth_mode");

  const tokenRes = await fetch(GITHUB_OAUTH_ACCESS_TOKEN, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.AUTH_GITHUB_ID.trim(),
      client_secret: env.AUTH_GITHUB_SECRET.trim(),
      code,
      redirect_uri: callbackRedirectUri(),
      code_verifier: verifier,
    }),
  });

  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return settingsRedirect("/settings?github=token_error");
  }

  const userRes = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "daily-snap/1.0 (GitHub integration)",
    },
  });
  const ghUser = (await userRes.json().catch(() => ({}))) as { id?: number; login?: string };
  if (!ghUser.id || typeof ghUser.login !== "string") {
    return settingsRedirect("/settings?github=user_error");
  }

  const grantedScope =
    typeof tokenJson.scope === "string" && tokenJson.scope.trim()
      ? tokenJson.scope.trim()
      : mode === "private"
        ? GITHUB_SCOPE_PRIVATE
        : GITHUB_SCOPE_PUBLIC;

  await saveGithubOAuthToken(
    session.userId,
    {
      accessToken,
      tokenType: typeof tokenJson.token_type === "string" ? tokenJson.token_type : "bearer",
    },
    { oauthMode: mode, grantedScope },
  );

  await prisma.gitHubConnection.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      githubUserId: String(ghUser.id),
      login: ghUser.login,
      scope: grantedScope,
    },
    update: {
      githubUserId: String(ghUser.id),
      login: ghUser.login,
      scope: grantedScope,
      contributionsOldestYearSynced: 0,
      eventsEtag: null,
      lastSyncError: null,
    },
  });

  scheduleGithubSync(session.userId, "oauth_callback");

  return settingsRedirect("/settings?github=connected");
}
