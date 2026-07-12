import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/session";

/**
 * Returns the current logged-in user, or redirects to /login if there is none,
 * or the account is inactive. Use in (app) and (admin) layouts / server actions
 * as the real enforcement boundary (proxy.ts only does a fast redirect).
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Chat, Admin) depend on it.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Same as requireUser, but additionally redirects to /chat if the user is not an ADMIN.
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Admin) depend on it.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/chat");
  }
  return user;
}
