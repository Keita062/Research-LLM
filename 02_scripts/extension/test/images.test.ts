import { describe, expect, it } from "vitest";
import { takeBatch } from "../src/eventLogger";
import { MAX_IMAGE_BASE64, MAX_IMAGES, validImages } from "../src/images";

describe("validImages", () => {
  const ok = { mimeType: "image/jpeg", data: "QUJD" };

  it("形式・サイズが正しいものだけを最大件数まで返す", () => {
    const input = [
      ok,
      { mimeType: "image/svg+xml", data: "QUJD" },
      { mimeType: "image/png", data: "not base64!" },
      { mimeType: "image/png", data: "A".repeat(MAX_IMAGE_BASE64 + 4) },
      null,
      ok,
      ok,
      ok,
      ok,
    ];
    const out = validImages(input);
    expect(out).toHaveLength(MAX_IMAGES);
    expect(out.every((x) => x.mimeType === "image/jpeg")).toBe(true);
  });

  it("配列でなければ空", () => {
    expect(validImages(undefined)).toEqual([]);
  });
});

describe("takeBatch", () => {
  it("件数と合計サイズの上限で区切る（1件目は大きくても含める）", () => {
    const big = { data: "x".repeat(100) };
    const small = { data: "y" };
    expect(takeBatch([big, small, small], 10, 50)).toEqual([big]);
    expect(takeBatch([small, small, big], 10, 50)).toEqual([small, small]);
    expect(takeBatch([small, small, small], 2, 1000)).toEqual([small, small]);
  });
});
