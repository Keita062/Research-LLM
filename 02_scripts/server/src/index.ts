import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { GeminiClient, type LlmClient } from "./llm.js";
import { MockLlmClient } from "./mockLlm.js";
import { FirestoreStore } from "./store/firestoreStore.js";
import { MemoryStore } from "./store/memoryStore.js";

const config = loadConfig();
const store = config.store === "firestore" ? new FirestoreStore() : new MemoryStore();
let llm: LlmClient;
if (config.geminiApiKey) {
  llm = new GeminiClient(config.geminiApiKey);
} else {
  if (config.production) throw new Error("GEMINI_API_KEY is required in production");
  console.warn("GEMINI_API_KEY 未設定のためモック応答を使います");
  llm = new MockLlmClient();
}

serve({ fetch: createApp({ store, llm, config }).fetch, port: config.port }, (info) => {
  console.log(`research-llm-server listening on :${info.port} (store=${config.store})`);
});
