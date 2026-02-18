export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { CaseEventType, Role } from "@prisma/client";

const ALLOWED_ROLES = [Role.ADMIN, Role.BACKOFFICE, Role.PLANNER, Role.TECHNICIAN];

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const workOrderId = String(ctx.params.id);

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    select: { id: true, caseId: true, workOrderNo: true },
  });
  if (!wo) return NextResponse.json({ error: "WorkOrder not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const relPath = await saveUpload(file, `work-orders/${wo.id}/order-file`);

  const updated = await prisma.workOrder.update({
    where: { id: wo.id },
    data: {
      orderFilePath: relPath,
      orderFileName: file.name || null,
      orderFileMimeType: file.type || null,
      orderFileSize: file.size || null,
      orderFileUpdatedAt: new Date(),
    },
    select: {
      id: true,
      orderFilePath: true,
      orderFileName: true,
      orderFileMimeType: true,
      orderFileSize: true,
      orderFileUpdatedAt: true,
    },
  });

  await prisma.caseEvent.create({
    data: {
      caseId: wo.caseId,
      type: CaseEventType.COMMENT,
      message: `Archivo OT cargado${file.name ? `: ${file.name}` : ""}`,
      meta: { workOrderId: wo.id, by: userId, filePath: relPath, kind: "WORK_ORDER_FILE" },
    },
  });

  return NextResponse.json({ ok: true, file: updated });
}

