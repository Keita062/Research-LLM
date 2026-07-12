import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

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
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Reads the session cookie, looks up the Session+User in the DB, and returns
 * the current user if the session is valid, not expired, and the user is active.
 * Returns null if there is no valid session.
 * STUB: implemented by Agent-Auth. Do not change this function's signature —
 * other agents (Chat, Admin) depend on it.
 */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    // Lazily clean up expired session rows.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  if (!session.user.isActive) {
    // FR-20: an admin-disabled account loses access immediately, even with a
    // still-valid session cookie.
    return null;
  }

  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    isActive: session.user.isActive,
  };

  return { user };
}

/**
 * Deletes the current session from the DB and clears the session cookie.
 * STUB: implemented by Agent-Auth.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
