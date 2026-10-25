export interface AppConfig {
  port: number;
  production: boolean;
  store: "memory" | "firestore";
  geminiApiKey?: string;
  adminEmails: string[];
  googleClientId?: string;
  googleClientSecret?: string;
  publicUrl: string;
  sessionSecret: string;
  devLogin: boolean;
  usageTimeZone: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const sessionSecret = env.SESSION_SECRET ?? "";
  if (production && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  return {
    port: Number(env.PORT ?? 8080),
    production,
    store: env.STORE === "firestore" ? "firestore" : "memory",
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    adminEmails: (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    googleClientId: env.GOOGLE_CLIENT_ID || undefined,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || undefined,
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8080}`).replace(/\/$/, ""),
    sessionSecret: sessionSecret || "dev-only-session-secret-dev-only-session-secret",
    devLogin: !production && env.ADMIN_DEV_LOGIN === "1",
    // Gemini API の無料枠の日次上限は太平洋時間 0 時にリセットされるため既定で合わせる
    usageTimeZone: env.USAGE_TIME_ZONE ?? "America/Los_Angeles",
  };
}
