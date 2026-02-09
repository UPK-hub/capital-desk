export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";

async function canAccessThread(tenantId: string, userId: string, threadId: string) {
  const participant = await prisma.directChatParticipant.findFirst({
    where: { threadId, userId, thread: { tenantId } },
    select: { id: true },
  });
  return Boolean(participant);
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const threadId = String(ctx.params.id);

  const ok = await canAccessThread(tenantId, userId, threadId);
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "El archivo supera 10MB" }, { status: 413 });
  }

  const filePath = await saveUpload(file, `direct-chat/${threadId}`);
  const isImage = (file.type ?? "").startsWith("image/");

  const message = await prisma.directChatMessage.create({
    data: {
      tenantId,
      threadId,
      senderId: userId,
      message: isImage ? "[Imagen]" : "[Archivo]",
      meta: {
        filePath,
        filename: file.name,
        mime: file.type,
        size: file.size,
        kind: isImage ? "image" : "file",
      },
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  await prisma.directChatThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, item: message });
}
