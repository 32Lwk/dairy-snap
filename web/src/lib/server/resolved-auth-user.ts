import type { Session } from "next-auth";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";

type ResolvedDbUser = NonNullable<Awaited<ReturnType<typeof resolveDbUserFromSession>>>;

export type ResolvedAuthResult =
  | { status: "unauthenticated" }
  | { status: "session_mismatch"; authSession: Session }
  | { status: "ok"; authSession: Session; user: ResolvedDbUser };

/**
 * RSC / Route で JWT の user.id と Prisma の行を一致させる。
 * API の resolveDbUserFromSession と同じルール（メールでのフォールバック）。
 */
export async function getResolvedAuthUser(): Promise<ResolvedAuthResult> {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return { status: "unauthenticated" };
  }
  const user = await resolveDbUserFromSession({
    sessionUserId: authSession.user.id,
    sessionEmail: authSession.user.email,
  });
  if (!user) {
    return { status: "session_mismatch", authSession };
  }
  return { status: "ok", authSession, user };
}
