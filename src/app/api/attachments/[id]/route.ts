import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Serves the raw bytes of a stored attachment (image thumbnail / CSV /
 * Excel download), scoped to the requesting user via the owning
 * conversation. 404 rather than 403 for other users' attachments, mirroring
 * the conversation lookup elsewhere in this app.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await getSession().catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "ログインが必要です。" },
      { status: 401 }
    );
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      fileName: true,
      mimeType: true,
      data: true,
      message: { select: { conversation: { select: { userId: true } } } },
    },
  });

  if (!attachment || attachment.message.conversation.userId !== session.user.id) {
    return NextResponse.json(
      { error: "not_found", message: "ファイルが見つかりません。" },
      { status: 404 }
    );
  }

  const isImage = attachment.mimeType.startsWith("image/");
  const encodedName = encodeURIComponent(attachment.fileName);

  return new Response(Buffer.from(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
