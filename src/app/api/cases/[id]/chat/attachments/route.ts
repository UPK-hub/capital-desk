export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { saveUpload } from "@/lib/uploads";

async function canAccessCaseChat(tenantId: string, userId: string, role: Role, caseId: string) {
  const c = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    include: { workOrder: { select: { assignedToId: true } } },
  });
  if (!c) return { ok: false, status: 404 };

  if (role === Role.TECHNICIAN) {
    if (c.workOrder?.assignedToId !== userId) return { ok: false, status: 403 };
  }

  if ([Role.ADMIN, Role.BACKOFFICE, Role.PLANNER, Role.SUPERVISOR, Role.HELPDESK].includes(role)) {
    return { ok: true, status: 200 };
  }

  if (role === Role.TECHNICIAN) return { ok: true, status: 200 };

  return { ok: false, status: 403 };
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = session.user.role as Role;
  const caseId = String(ctx.params.id);

  const access = await canAccessCaseChat(tenantId, userId, role, caseId);
  if (!access.ok) return NextResponse.json({ error: "No autorizado" }, { status: access.status });

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "El archivo supera 10MB" }, { status: 413 });
  }

  const filePath = await saveUpload(file, `case-chat/${caseId}`);
  const isImage = (file.type ?? "").startsWith("image/");

  const message = await prisma.caseChatMessage.create({
    data: {
      tenantId,
      caseId,
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

  return NextResponse.json({ ok: true, item: message });
}
