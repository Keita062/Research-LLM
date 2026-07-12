import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * A pre-computed bcrypt hash of a constant, never-used password. Used to perform a
 * dummy comparison (timing-attack mitigation) when a user account does not exist,
 * so that "user not found" and "wrong password" take a similar amount of time.
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$Vm6r8TAhKpEv5ZuoMzDfTOHwEj6LmLEZDxcYsM4MYo5cWKp5OX0TW";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
