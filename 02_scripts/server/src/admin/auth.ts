import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "../config.js";

const SESSION_COOKIE = "admin_session";
const STATE_COOKIE = "oauth_state";
const SESSION_HOURS = 12;

export type AdminEnv = { Variables: { adminEmail: string } };

export function isAllowedAdmin(email: string | undefined, verified: boolean | undefined, allow: string[]): boolean {
  return !!email && verified === true && allow.includes(email.toLowerCase());
}

function cookieOptions(config: AppConfig, maxAge: number) {
  return { httpOnly: true, secure: config.production, sameSite: "Lax" as const, path: "/admin", maxAge };
}

export async function startSession(c: Context, config: AppConfig, email: string) {
  const exp = Date.now() + SESSION_HOURS * 3_600_000;
  await setSignedCookie(c, SESSION_COOKIE, `${email}|${exp}`, config.sessionSecret, cookieOptions(config, SESSION_HOURS * 3600));
}

export function endSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/admin" });
}

export function requireAdmin(config: AppConfig): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const v = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE);
    const [email, exp] = typeof v === "string" ? v.split("|") : [];
    if (!email || !exp || Number(exp) < Date.now() || !config.adminEmails.includes(email)) {
      return c.redirect("/admin/login");
    }
    if (c.req.method === "POST") {
      const origin = c.req.header("origin");
      if (origin && new URL(origin).host !== new URL(c.req.url).host && origin !== config.publicUrl) {
        return c.text("forbidden", 403);
      }
    }
    c.set("adminEmail", email);
    await next();
  };
}

export class GoogleAuth {
  private client: OAuth2Client;

  constructor(private config: AppConfig) {
    this.client = new OAuth2Client({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: `${config.publicUrl}/admin/oauth/callback`,
    });
  }

  get enabled() {
    return !!(this.config.googleClientId && this.config.googleClientSecret);
  }

  async begin(c: Context) {
    const state = crypto.randomUUID();
    await setSignedCookie(c, STATE_COOKIE, state, this.config.sessionSecret, cookieOptions(this.config, 600));
    const url = this.client.generateAuthUrl({ scope: ["openid", "email"], state, prompt: "select_account" });
    return c.redirect(url);
  }

  /** 成功時はメールアドレス、失敗時は null */
  async finish(c: Context): Promise<string | null> {
    const expected = await getSignedCookie(c, this.config.sessionSecret, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/admin" });
    const code = c.req.query("code");
    if (!code || !expected || c.req.query("state") !== expected) return null;
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) return null;
    const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.googleClientId });
    const payload = ticket.getPayload();
    if (!isAllowedAdmin(payload?.email, payload?.email_verified, this.config.adminEmails)) return null;
    return payload!.email!.toLowerCase();
  }
}
