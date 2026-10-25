import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEdit, prepareEdit, resolveInWorkspace, runCommand, runReadTool, ToolError } from "../src/tools";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "rllm-"));
  await fs.writeFile(path.join(root, "a.py"), "print(1)\nprint(2)\n");
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe("tools", () => {
  it("ワークスペース外のパスを拒否する", () => {
    expect(() => resolveInWorkspace(root, "../x")).toThrow(ToolError);
    expect(() => resolveInWorkspace(root, path.resolve(root, "..", "y"))).toThrow(ToolError);
  });

  it("read/list/search", async () => {
    const r = await runReadTool(root, "read_file", { path: "a.py" });
    expect(r.response.content).toContain("print(2)");
    expect(r.meta).toMatchObject({ fileExtension: ".py" });
    expect(JSON.stringify(r.meta)).not.toContain("a.py");
    expect((await runReadTool(root, "list_files", {})).response.entries).toEqual(["a.py"]);
    expect((await runReadTool(root, "search_files", { query: "print(2)" })).response.matches).toEqual(["a.py:2: print(2)"]);
  });

  it("edit_file は一意な一致のみ置換し、メタデータは行数と拡張子だけ", async () => {
    await expect(prepareEdit(root, "edit_file", { path: "a.py", old_text: "print", new_text: "x" })).rejects.toThrow(ToolError);
    const edit = await prepareEdit(root, "edit_file", { path: "a.py", old_text: "print(2)", new_text: "print(3)\nprint(4)" });
    const out = await applyEdit(edit);
    expect(await fs.readFile(path.join(root, "a.py"), "utf8")).toBe("print(1)\nprint(3)\nprint(4)\n");
    expect(out.meta).toEqual({ linesAdded: 2, linesRemoved: 1, fileExtension: ".py", created: false });
  });

  it("write_file でサブフォルダに新規作成できる", async () => {
    const edit = await prepareEdit(root, "write_file", { path: "sub/new.cs", content: "class A {}\n" });
    expect(edit.existed).toBe(false);
    await applyEdit(edit);
    expect(await fs.readFile(path.join(root, "sub", "new.cs"), "utf8")).toBe("class A {}\n");
  });

  it("run_command は終了コードと出力を返し、メタデータにコマンド文字列や出力を含めない", async () => {
    const r = await runCommand(root, "node -e \"console.log('hi')\"");
    expect(r.response).toMatchObject({ exitCode: 0 });
    expect(String(r.response.output)).toContain("hi");
    expect(r.meta).toEqual({ exitCode: 0, outputChars: expect.any(Number), timedOut: false });
  });
});
