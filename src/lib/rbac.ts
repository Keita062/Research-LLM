import "server-only";
import type { SessionUser } from "@/lib/session";

/**
 * Returns the current logged-in user, or redirects to /login if there is none,
 * or the account is inactive. Use in (app) and (admin) layouts / server actions
 * as the real enforcement boundary (proxy.ts only does a fast redirect).
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Chat, Admin) depend on it.
 */
export async function requireUser(): Promise<SessionUser> {
  throw new Error("rbac.requireUser: not implemented yet");
}

/**
 * Same as requireUser, but additionally redirects to /chat if the user is not an ADMIN.
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Admin) depend on it.
 */
export async function requireAdmin(): Promise<SessionUser> {
  throw new Error("rbac.requireAdmin: not implemented yet");
}
