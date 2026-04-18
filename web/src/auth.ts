import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { JWT } from "next-auth/jwt";
import { env } from "@/env";
import { emailMatchesAllowlist } from "@/lib/access-control";
import { prisma } from "@/server/db";

async function syncAllowlistFlag(userId: string, email: string | null | undefined) {
  if (!email?.trim()) return;
  await prisma.user.update({
    where: { id: userId },
    data: { isAllowed: emailMatchesAllowlist(email) },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 本番で Cloudflare / Cloud Run 等のプロキシ背後でもコールバック URL を正しく解決する
  trustHost: true,
  basePath: "/api/auth",
  debug: env.AUTH_DEBUG === "1",
  secret: env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      return true;
    },
    async jwt({ token, user, trigger, session }): Promise<JWT> {
      if (user?.id) {
        // isAllowed は ALLOWED_EMAILS と同じルールで決める（JWT 内の余計な Prisma読み取りを避け、失敗時もログインが Configuration に化けにくくする）
        token.sub = user.id;
        token.id = user.id;
        token.isAllowed = emailMatchesAllowlist(user.email);
        if (user.email) token.email = user.email;
        void syncAllowlistFlag(user.id, user.email).catch((err) => {
          console.error("[auth] syncAllowlistFlag (jwt)", err);
        });
      } else if (trigger === "update" && session && typeof session === "object") {
        const s = session as { isAllowed?: boolean };
        if (typeof s.isAllowed === "boolean") {
          token.isAllowed = s.isAllowed;
        }
      } else if (typeof token.email === "string" && token.email.length > 0) {
        token.isAllowed = emailMatchesAllowlist(token.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.isAllowed = Boolean(token.isAllowed);
        if (typeof token.email === "string" && token.email.length > 0) {
          session.user.email = token.email;
        }
      }
      return session;
    },
  },
  events: {
    /**
     * JWT セッションでは既存 OAuth ログイン時に `linkAccount` が呼ばれず、Google が返すトークンが DB に保存されない。
     * ここで `accounts` を更新して refresh_token / scope を保持する。
     */
    async signIn({ user, account }) {
      if (user.id) {
        try {
          await syncAllowlistFlag(user.id, user.email);
        } catch (err) {
          console.error("[auth] events.signIn syncAllowlistFlag", err);
        }
      }
      if (account?.provider === "google" && user.id) {
        try {
          const a = account as {
            providerAccountId?: string;
            refresh_token?: string | null;
            access_token?: string | null;
            expires_at?: number | null;
            token_type?: string | null;
            scope?: string | null;
          };
          const data: {
            refresh_token?: string | null;
            access_token?: string | null;
            expires_at?: number | null;
            token_type?: string | null;
            scope?: string | null;
          } = {};
          if (a.refresh_token) data.refresh_token = a.refresh_token;
          if (a.access_token) data.access_token = a.access_token;
          if (a.expires_at != null) data.expires_at = a.expires_at;
          if (a.token_type) data.token_type = a.token_type;
          if (a.scope) data.scope = a.scope;
          if (Object.keys(data).length === 0) return;
          await prisma.account.updateMany({
            where: { userId: user.id, provider: "google" },
            data,
          });
        } catch (err) {
          console.error("[auth] events.signIn account tokens", err);
        }
      }
    },
    async createUser({ user }) {
      try {
        if (user.id) await syncAllowlistFlag(user.id, user.email);
      } catch (err) {
        console.error("[auth] events.createUser", err);
      }
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
});
