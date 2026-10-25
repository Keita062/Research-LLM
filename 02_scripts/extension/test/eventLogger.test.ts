import { describe, expect, it } from "vitest";
import { EventLogger } from "../src/eventLogger";

function memoryStorage() {
  const m = new Map<string, unknown>();
  return { get: <T>(k: string) => m.get(k) as T | undefined, update: async (k: string, v: unknown) => void m.set(k, v) };
}
const env = { extensionVersion: "0.1.0", vscodeVersion: "1.90.0", os: "test" };

describe("EventLogger", () => {
  it("送信失敗時は保持し、次回に再送する", async () => {
    const sent: unknown[][] = [];
    let fail = true;
    const logger = new EventLogger(memoryStorage(), async (ev) => {
      if (fail) throw new Error("offline");
      sent.push(ev);
    }, env);
    await logger.log({ type: "user_prompt", payload: { chars: 3 } });
    await expect(logger.flush()).rejects.toThrow();
    expect(logger.pending).toBe(1);
    fail = false;
    await logger.flush();
    expect(logger.pending).toBe(0);
    expect(sent[0][0]).toMatchObject({ type: "user_prompt", payload: { chars: 3 }, extensionVersion: "0.1.0" });
  });

  it("一時停止中は記録しない（停止・再開イベントのみ記録）", async () => {
    const logger = new EventLogger(memoryStorage(), async () => undefined, env);
    await logger.setPaused(true);
    await logger.log({ type: "user_prompt" });
    await logger.setPaused(false);
    await logger.log({ type: "model_response" });
    const types: string[] = [];
    const l2 = logger as unknown as { buffer(): { type: string }[] };
    for (const e of l2.buffer()) types.push(e.type);
    expect(types).toEqual(["collection_paused", "collection_resumed", "model_response"]);
  });
});
