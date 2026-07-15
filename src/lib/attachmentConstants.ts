// Shared between client (ChatPanel) and server (attachments.ts / chat route) —
// no "server-only" guard here since the client needs these for pre-flight
// validation before upload. Server-side validation in the API route is the
// real enforcement; client-side checks are just for fast feedback.

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB per file
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

export const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.csv,.xlsx";
