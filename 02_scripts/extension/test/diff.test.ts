import { describe, expect, it } from "vitest";
import { fileExtension, lineDiffCounts } from "../src/diff";

describe("lineDiffCounts", () => {
  it("追加・削除行を数える", () => {
    expect(lineDiffCounts("a\nb\nc", "a\nx\nc\nd")).toEqual({ linesAdded: 2, linesRemoved: 1 });
    expect(lineDiffCounts("", "a\nb")).toEqual({ linesAdded: 2, linesRemoved: 0 });
    expect(lineDiffCounts("a", "a")).toEqual({ linesAdded: 0, linesRemoved: 0 });
  });
});

describe("fileExtension", () => {
  it("拡張子のみを返し、名前やパスは返さない", () => {
    expect(fileExtension("Assets/Scripts/Player.CS")).toBe(".cs");
    expect(fileExtension(String.raw`C:\work\sketch.pde`)).toBe(".pde");
    expect(fileExtension(".gitignore")).toBeNull();
    expect(fileExtension("Makefile")).toBeNull();
  });
});
