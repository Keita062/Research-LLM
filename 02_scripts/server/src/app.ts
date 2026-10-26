import { Hono } from "hono";
import { createAdmin } from "./admin/routes.js";
import { createApi } from "./api.js";
import type { AppConfig } from "./config.js";
import type { LlmClient } from "./llm.js";
import type { Store } from "./store/types.js";

export function createApp(deps: { store: Store; llm: LlmClient; config: AppConfig; now?: () => Date }) {
  const app = new Hono();
  // Cloud Run では末尾が z のパス（/healthz 等）が予約されているため /health を使う
  app.get("/health", (c) => c.text("ok"));
  app.get("/", (c) => c.redirect("/admin"));
  app.route("/api/v1", createApi(deps));
  app.route("/admin", createAdmin(deps));
  return app;
}
