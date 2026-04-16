import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
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

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  const isApi = nextUrl.pathname.startsWith("/api/");
  const isLogin = nextUrl.pathname === "/login";
  const isForbidden = nextUrl.pathname === "/forbidden";
  const isAccountMeApi = nextUrl.pathname === "/api/account/me" && req.method === "GET";
  const isAccountDeleteApi = nextUrl.pathname === "/api/account/delete" && req.method === "POST";

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

  if (isAuthed && !isAllowed && !isLogin && !isForbidden) {
    if (isApi && !isAccountMeApi && !isAccountDeleteApi) {
      return NextResponse.json({ error: "利用が許可されていません" }, { status: 403 });
    }
    if (!isApi) {
      return NextResponse.redirect(new URL("/forbidden", nextUrl));
    }
  }

  if (isAuthed && isAllowed && isLogin) {
    return NextResponse.redirect(new URL("/today", nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
