export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUploadsRoot, resolveUploadPath } from "@/lib/uploads";
import fs from "node:fs";
import path from "node:path";

export async function GET(_req: NextRequest, ctx: { params: { token: string } }) {
  const token = String(ctx.params.token);
  const now = new Date();

  const record = await prisma.videoDownloadToken.findFirst({
    where: { token, expiresAt: { gt: now } },
    include: { attachment: true },
  });

  if (!record) return new Response("Invalid or expired token", { status: 404 });

  let filePath = "";
  try {
    filePath = resolveUploadPath(record.attachment.filePath);
  } catch {
    return new Response("Invalid path", { status: 400 });
  }
  const uploadsRoot = path.resolve(getUploadsRoot());
  if (filePath !== uploadsRoot && !filePath.startsWith(uploadsRoot + path.sep)) {
    return new Response("Invalid path", { status: 400 });
  }
  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = fs.createReadStream(filePath);
  const filename = record.attachment.originalName || "video";
  const mimeType = record.attachment.mimeType || "application/octet-stream";
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
