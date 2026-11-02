import type { ImageInput } from "./eventLogger";

/** 添付画像の制限（webview で縮小済みのものを受け取る。サーバー側でも同じ制限で検証する） */
export const MAX_IMAGES = 4;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BASE64 = 1_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** webview から届いた添付画像のうち、形式とサイズが正しいものだけを最大 MAX_IMAGES 件返す */
export function validImages(input: unknown): ImageInput[] {
  if (!Array.isArray(input)) return [];
  const out: ImageInput[] = [];
  for (const raw of input) {
    if (out.length >= MAX_IMAGES) break;
    const { mimeType, data } = (raw ?? {}) as Partial<ImageInput>;
    if (typeof mimeType !== "string" || !IMAGE_MIME_TYPES.includes(mimeType)) continue;
    if (typeof data !== "string" || data.length === 0 || data.length > MAX_IMAGE_BASE64 || !BASE64.test(data)) continue;
    out.push({ mimeType, data });
  }
  return out;
}
