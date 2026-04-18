import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16+: `middleware` is deprecated in favor of `proxy`.
 * Proxy は既定で Node.js ランタイムのため、`next-auth/jwt` → jose の JWE 復号（CompressionStream 等）が Edge で落ちる問題を避けられる。
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export default async function proxy(req: NextRequest) {
  const { nextUrl } = req;

  if (nextUrl.pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (
    nextUrl.pathname === "/sw.js" ||
    nextUrl.pathname === "/service-worker.js" ||
    nextUrl.pathname.startsWith("/workbox") ||
    nextUrl.pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  // HTTPS では `__Secure-authjs.session-token`。getToken に secureCookie: true が必要。
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secureCookie =
    nextUrl.protocol === "https:" || forwardedProto === "https";

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });

  const isApi = nextUrl.pathname.startsWith("/api/");
  const isLogin = nextUrl.pathname === "/login";
  const isForbidden = nextUrl.pathname === "/forbidden";
  const isOnboarding =
    nextUrl.pathname === "/onboarding" || nextUrl.pathname.startsWith("/onboarding/");
  const isAccountMeApi = nextUrl.pathname === "/api/account/me" && req.method === "GET";
  const isAccountDeleteApi = nextUrl.pathname === "/api/account/delete" && req.method === "POST";
  const isSettingsApi =
    nextUrl.pathname === "/api/settings" &&
    (req.method === "GET" || req.method === "PATCH");
  const isSchoolsApiGet = nextUrl.pathname === "/api/schools" && req.method === "GET";

  const isAuthed = Boolean(token);
  const isAllowed = Boolean(token?.isAllowed);

  if (!isAuthed) {
    if (isApi) {
      return NextResponse.json({ error: "未ログインです" }, { status: 401 });
    }
    if (!isLogin) {
      const url = new URL("/login", nextUrl);
      url.searchParams.set("next", nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  const disallowedApiOk =
    isAccountMeApi || isAccountDeleteApi || isSettingsApi || isSchoolsApiGet;

  if (isAuthed && !isAllowed && !isLogin && !isForbidden) {
    if (isApi && !disallowedApiOk) {
      return NextResponse.json({ error: "利用が許可されていません" }, { status: 403 });
    }
    if (!isApi && !isOnboarding) {
      return NextResponse.redirect(new URL("/onboarding", nextUrl));
    }
  }

  if (isAuthed && !isAllowed && isLogin) {
    return NextResponse.redirect(new URL("/onboarding", nextUrl));
  }

  if (isAuthed && isAllowed && isLogin) {
    return NextResponse.redirect(new URL("/today", nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
