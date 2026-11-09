// 配布用 ZIP を作る（build-distribution.sh から呼ばれる）。
// Windows の zip／Compress-Archive で作ると、macOS で次の問題が起きるため自前で書き出す。
//   - install.command の実行権限が消え、ダブルクリックで「アクセス権がない」エラーになる
//   - 日本語のファイル名が Shift_JIS で入り、macOS で文字化けする
// 使い方: node make-zip.mjs <出力.zip> <フォルダ>（どちらも現在のフォルダからの相対パス）
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const [outPath, dir] = process.argv.slice(2);
if (!outPath || !dir) {
  console.error("使い方: node make-zip.mjs <出力.zip> <フォルダ>");
  process.exit(1);
}

/** 実行権限を付けるファイル（macOS 用インストーラー） */
const EXECUTABLE = /\.(command|sh)$/;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** ZIP 内のパスは常に「/」区切り */
function walk(rel) {
  const out = [{ name: `${rel}/`, dir: true }];
  for (const e of readdirSync(join(dir, "..", rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...walk(`${rel}/${e.name}`));
    else out.push({ name: `${rel}/${e.name}`, dir: false });
  }
  return out;
}

const base = dir.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
const entries = walk(base);
const locals = [];
const centrals = [];
let offset = 0;

for (const e of entries) {
  const name = Buffer.from(e.name, "utf8");
  const src = e.dir ? Buffer.alloc(0) : readFileSync(join(dir, "..", e.name));
  const data = e.dir ? src : deflateRawSync(src, { level: 9 });
  const method = e.dir ? 0 : 8;
  const crc = crc32(src);
  const { time, date } = dosTime(statSync(join(dir, "..", e.name)).mtime);
  const mode = e.dir ? 0o40755 : EXECUTABLE.test(e.name) ? 0o100755 : 0o100644;
  const FLAG_UTF8 = 0x0800;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // 展開に必要なバージョン
  local.writeUInt16LE(FLAG_UTF8, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(src.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, data);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE((3 << 8) | 20, 4); // 作成元 = Unix（権限を有効にするため）
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(FLAG_UTF8, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(src.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // 内部属性
  central.writeUInt32LE(((mode << 16) | (e.dir ? 0x10 : 0)) >>> 0, 38); // 外部属性（上位16ビットが Unix の権限）
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + data.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(outPath, Buffer.concat([...locals, ...centrals, end]));
