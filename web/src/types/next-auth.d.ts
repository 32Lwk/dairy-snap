import NextAuth from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAllowed: boolean;
    } & NonNullable<NextAuth.Session["user"]>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isAllowed?: boolean;
    /** DB の user.id とずれたときのフォールバック解決用 */
    email?: string | null;
  }
}

