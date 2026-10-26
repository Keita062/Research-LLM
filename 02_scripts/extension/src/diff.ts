/** 行単位の追加・削除数（LCS）。大きいファイルは近似（先頭・末尾の共通部分を除いた行数）にする */
export function lineDiffCounts(before: string, after: string): { linesAdded: number; linesRemoved: number } {
  const a = before === "" ? [] : before.split(/\r?\n/);
  const b = after === "" ? [] : after.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (x.length * y.length > 4_000_000) return { linesAdded: y.length, linesRemoved: x.length };
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  const common = prev[y.length];
  return { linesAdded: y.length - common, linesRemoved: x.length - common };
}

/** 拡張子のみ（小文字）。ファイル名やパスは返さない */
export function fileExtension(p: string): string | null {
  const base = p.replaceAll(String.fromCharCode(92), "/").split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return null;
  const ext = base.slice(i).toLowerCase();
  return /^\.[a-z0-9_+-]{1,15}$/.test(ext) ? ext : null;
}
