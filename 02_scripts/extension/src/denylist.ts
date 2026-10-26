import * as path from "node:path";

/** 秘密情報を含みうるため、ツールから読み書きさせないファイル（設定 researchLlm.deniedFiles で変更可） */
export const DEFAULT_DENIED = [".env", ".env.*", "*.pem", "*.key", "*.pfx", "*.p12", "id_rsa*", "id_ed25519*", "credentials*.json", ".git", ".ssh"];

export const toolConfig = { denied: [...DEFAULT_DENIED] };

const BACKSLASH = String.fromCharCode(92);
const SPECIAL = ".+?^${}()|[]" + BACKSLASH;
const escapeRe = (s: string) => [...s].map((c) => (SPECIAL.includes(c) ? BACKSLASH + c : c)).join("");

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("**")
    .map((part) => part.split("*").map(escapeRe).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${body}$`, "i");
}

/** rel はワークスペースからの相対パス。"/" を含まないパターンはパスのどの階層の名前にも一致する */
export function isDenied(rel: string, patterns: string[] = toolConfig.denied): boolean {
  const norm = rel.split(path.sep).join("/");
  if (!norm || norm === ".") return false;
  const segments = norm.split("/");
  return patterns.some((p) => {
    const re = globToRegExp(p);
    return p.includes("/") ? re.test(norm) : segments.some((s) => re.test(s));
  });
}
