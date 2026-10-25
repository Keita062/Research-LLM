import { describe, expect, it } from "vitest";
import { isDenied } from "../src/denylist";

describe("isDenied", () => {
  it("秘密情報ファイルとフォルダを拒否する", () => {
    expect(isDenied(".env")).toBe(true);
    expect(isDenied("config/.env.local")).toBe(true);
    expect(isDenied("certs/server.PEM")).toBe(true);
    expect(isDenied(".git/config")).toBe(true);
    expect(isDenied("Assets/Scripts/Player.cs")).toBe(false);
    expect(isDenied(".")).toBe(false);
  });
});
