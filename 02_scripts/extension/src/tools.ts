import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FunctionDeclaration } from "./apiClient";
import { isDenied } from "./denylist";
import { fileExtension, lineDiffCounts } from "./diff";

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "read_file",
    description: "ワークスペース内のテキストファイルを読む。path はワークスペースからの相対パス",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "list_files",
    description: "ディレクトリ内のファイルとフォルダを一覧する（node_modules 等は除外）",
    parameters: { type: "object", properties: { path: { type: "string", description: "既定は ." } } },
  },
  {
    name: "search_files",
    description: "ワークスペース内のテキストファイルから文字列を検索し、該当行を返す",
    parameters: { type: "object", properties: { query: { type: "string" }, path: { type: "string" } }, required: ["query"] },
  },
  {
    name: "edit_file",
    description: "ファイル内の old_text（ちょうど1か所に一致すること）を new_text に置き換える。参加者の承認後に実行される",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "write_file",
    description: "ファイルを新規作成または全体を上書きする。参加者の承認後に実行される",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  },
  {
    name: "run_command",
    description: "ワークスペースのルートでシェルコマンドを実行し、出力を返す（60秒で打ち切り）。参加者の承認後に実行される",
    parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
  },
];

export const APPROVAL_REQUIRED = new Set(["edit_file", "write_file", "run_command"]);
const IGNORED_DIRS = new Set([".git", "node_modules", "Library", "Temp", "obj", "bin", ".vs", "dist", "out", "__pycache__"]);
const MAX_READ = 200_000;
const MAX_OUTPUT = 20_000;

export interface ToolOutcome {
  response: Record<string, unknown>;
  /** ログ用のメタデータ（パス・内容・コマンド文字列は含めない） */
  meta: Record<string, unknown>;
}

export class ToolError extends Error {}

export function resolveInWorkspace(root: string, p: unknown): string {
  if (typeof p !== "string" || p === "") p = ".";
  const abs = path.resolve(root, p as string);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new ToolError("ワークスペース外のパスは扱えません");
  if (isDenied(rel)) throw new ToolError("秘密情報を含む可能性があるファイルのため扱えません");
  return abs;
}

async function readText(abs: string): Promise<string> {
  const buf = await fs.readFile(abs);
  if (buf.includes(0)) throw new ToolError("バイナリファイルは読めません");
  return buf.toString("utf8");
}

async function walk(dir: string, out: string[], limit: number): Promise<void> {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (out.length >= limit) return;
    if (IGNORED_DIRS.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(abs, out, limit);
    else if (ent.isFile()) out.push(abs);
  }
}

export interface PreparedEdit {
  abs: string;
  before: string;
  after: string;
  existed: boolean;
}

/** edit_file / write_file の変更内容を計算する（承認前の差分表示に使う） */
export async function prepareEdit(root: string, name: string, args: Record<string, unknown>): Promise<PreparedEdit> {
  const abs = resolveInWorkspace(root, args.path);
  const before = await readText(abs).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (name === "write_file") return { abs, before: before ?? "", after: String(args.content ?? ""), existed: before !== null };
  if (before === null) throw new ToolError("ファイルが存在しません");
  const oldText = String(args.old_text ?? "");
  const count = oldText ? before.split(oldText).length - 1 : 0;
  if (count !== 1) throw new ToolError(`old_text が ${count} か所に一致しました（ちょうど1か所である必要があります）`);
  return { abs, before, after: before.replace(oldText, () => String(args.new_text ?? "")), existed: true };
}

export async function applyEdit(edit: PreparedEdit): Promise<ToolOutcome> {
  await fs.mkdir(path.dirname(edit.abs), { recursive: true });
  await fs.writeFile(edit.abs, edit.after, "utf8");
  return {
    response: { ok: true },
    meta: { ...lineDiffCounts(edit.before, edit.after), fileExtension: fileExtension(edit.abs), created: !edit.existed },
  };
}

export async function runReadTool(root: string, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (name === "read_file") {
    const abs = resolveInWorkspace(root, args.path);
    const text = await readText(abs);
    return {
      response: { content: text.slice(0, MAX_READ), truncated: text.length > MAX_READ },
      meta: { fileExtension: fileExtension(abs), lines: text.split("\n").length },
    };
  }
  if (name === "list_files") {
    const abs = resolveInWorkspace(root, args.path);
    const ents = await fs.readdir(abs, { withFileTypes: true });
    const entries = ents.filter((e) => !IGNORED_DIRS.has(e.name) && !isDenied(path.relative(root, path.join(abs, e.name)))).slice(0, 500).map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return { response: { entries }, meta: { count: entries.length } };
  }
  if (name === "search_files") {
    const query = String(args.query ?? "");
    if (!query) throw new ToolError("query が空です");
    const files: string[] = [];
    await walk(resolveInWorkspace(root, args.path), files, 5000);
    const matches: string[] = [];
    for (const f of files) {
      if (matches.length >= 200) break;
      if (isDenied(path.relative(root, f))) continue;
      const text = await readText(f).catch(() => "");
      text.split(/\r?\n/).forEach((line, i) => {
        if (matches.length < 200 && line.includes(query)) matches.push(`${path.relative(root, f)}:${i + 1}: ${line.slice(0, 300)}`);
      });
    }
    return { response: { matches }, meta: { count: matches.length, filesScanned: files.length } };
  }
  throw new ToolError(`未知のツール: ${name}`);
}

export function runCommand(root: string, command: string, signal?: AbortSignal): Promise<ToolOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: root, shell: true, signal, timeout: 60_000, windowsHide: true });
    let out = "";
    const add = (d: Buffer) => {
      if (out.length < MAX_OUTPUT) out += d.toString("utf8");
    };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    const finish = (exitCode: number | null, error?: string) =>
      resolve({
        response: { exitCode, output: out.slice(0, MAX_OUTPUT), ...(error ? { error } : {}) },
        meta: { exitCode, outputChars: out.length, timedOut: error === "timeout" },
      });
    child.on("error", (e) => finish(null, e.name === "AbortError" ? "cancelled" : e.message));
    child.on("close", (code, sig) => finish(code, sig === "SIGTERM" ? "timeout" : undefined));
  });
}
