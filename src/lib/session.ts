import "server-only";
import type { Role } from "@/generated/prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
};

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "lab_chatbot_session";

/**
 * Creates a DB-backed session for the given user and sets the session cookie
 * on the current response (via `next/headers` cookies()).
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Chat, Admin) depend on it.
 */
export async function createSession(userId: string): Promise<void> {
  void userId;
  throw new Error("session.createSession: not implemented yet");
}

/**
 * Reads the session cookie, looks up the Session+User in the DB, and returns
 * the current user if the session is valid, not expired, and the user is active.
 * Returns null if there is no valid session.
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Chat, Admin) depend on it.
 */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  throw new Error("session.getSession: not implemented yet");
}

/**
 * Deletes the current session from the DB and clears the session cookie.
 * STUB: implemented by Agent-Auth.
 */
export async function destroySession(): Promise<void> {
  throw new Error("session.destroySession: not implemented yet");
}
