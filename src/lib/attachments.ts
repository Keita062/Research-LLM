import "server-only";
import ExcelJS from "exceljs";
import type { Part } from "@google/genai";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE } from "./attachmentConstants";

export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE };

export type AttachmentKind = "image" | "spreadsheet" | "csv";

export type StoredAttachment = {
  fileName: string;
  mimeType: string;
  data: Buffer;
};

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const SPREADSHEET_EXTENSION = /\.xlsx$/i;
const CSV_EXTENSION = /\.csv$/i;

/** Max characters of extracted text (CSV cell dump / spreadsheet dump) fed to Gemini per file. */
const MAX_EXTRACTED_TEXT_CHARS = 30_000;

/**
 * Classifies an uploaded/stored file by extension + MIME type. Extension is
 * the primary signal since browsers report inconsistent MIME types for
 * CSV/Excel across OSes; MIME type is the primary signal for images since
 * extensions there are more varied (jpg/jpeg/etc) but MIME is reliable.
 */
export function classifyAttachment(fileName: string, mimeType: string): AttachmentKind | null {
  if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return "image";
  if (SPREADSHEET_EXTENSION.test(fileName)) return "spreadsheet";
  if (CSV_EXTENSION.test(fileName) || mimeType === "text/csv") return "csv";
  return null;
}

/**
 * Browsers report inconsistent (or empty) MIME types for CSV/Excel across
 * OSes, so the MIME type we persist/send to Gemini is derived from the
 * classified kind rather than trusted verbatim from the upload.
 */
export function normalizedMimeType(kind: AttachmentKind, original: string): string {
  if (kind === "image") return original || "application/octet-stream";
  if (kind === "spreadsheet") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "text/csv";
}

function truncateText(text: string): string {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) return text;
  return (
    text.slice(0, MAX_EXTRACTED_TEXT_CHARS) +
    `\n...(${text.length - MAX_EXTRACTED_TEXT_CHARS}文字省略)`
  );
}

async function spreadsheetBufferToText(data: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as unknown as ArrayBuffer);

  const sheetTexts: string[] = [];
  workbook.eachSheet((worksheet) => {
    const lines: string[] = [];
    worksheet.eachRow((row) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1); // index 0 is unused by exceljs
      lines.push(
        cells
          .map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
          .join(",")
      );
    });
    sheetTexts.push(`# シート: ${worksheet.name}\n${lines.join("\n")}`);
  });

  return sheetTexts.join("\n\n");
}

/**
 * Converts a stored attachment into a Gemini request Part. Images are sent
 * as inline binary data; CSV/Excel files are converted to plain text so the
 * model can read them without needing native spreadsheet support.
 */
export async function attachmentToPart(attachment: StoredAttachment): Promise<Part> {
  const kind = classifyAttachment(attachment.fileName, attachment.mimeType);

  if (kind === "image") {
    return {
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.data.toString("base64"),
      },
    };
  }

  if (kind === "spreadsheet") {
    const text = await spreadsheetBufferToText(attachment.data);
    return { text: `--- 添付ファイル: ${attachment.fileName} ---\n${truncateText(text)}` };
  }

  // csv (and anything else that slipped through as text-ish)
  const text = attachment.data.toString("utf-8");
  return { text: `--- 添付ファイル: ${attachment.fileName} ---\n${truncateText(text)}` };
}
