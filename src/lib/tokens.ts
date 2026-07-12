import "server-only";
import crypto from "crypto";

/**
 * Generates a cryptographically random raw token (sent to the user via email link).
 * Only the SHA-256 hash of this value is ever stored in the database.
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hashes a raw token for storage/lookup. Verification tokens are stored in the DB
 * as `tokenHash` only — the raw token itself is never persisted.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
