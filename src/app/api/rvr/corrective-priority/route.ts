export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, Role, WorkOrderStatus } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { nextNumbers } from "@/lib/tenant-sequence";

function isRvrAllowed(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN || role === Role.SUPERVISOR) return true;
  if (role === Role.BACKOFFICE) return !capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  return false;
}

// Crea un CORRECTIVO para un bus del apartado "prioridad de correctivo" del RVR.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const busId = String(body?.busId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const detail = String(body?.detail ?? "").trim();
  if (!busId) return NextResponse.json({ error: "Falta el bus." }, { status: 400 });

  const bus = await prisma.bus.findFirst({ where: { id: busId, tenantId }, select: { id: true, code: true } });
  if (!bus) return NextResponse.json({ error: "Bus no encontrado." }, { status: 404 });

  try {
    const nums = await nextNumbers(prisma as any, tenantId, { case: true, workOrder: true });
    const corr = await prisma.case.create({
      data: {
        tenantId,
        caseNo: nums.caseNo ?? null,
        type: CaseType.CORRECTIVO,
        status: CaseStatus.OT_ASIGNADA,
        priority: 2,
        title: `Correctivo RVR ${bus.code}${reason ? ` - ${reason}` : ""}`.slice(0, 180),
        description: `Generado desde la Revisión Remota (prioridad de correctivo).\nMotivo: ${reason || "—"}${detail ? `\nDetalle: ${detail}` : ""}`,
        busId: bus.id,
        assignedToId: userId,
      },
      select: { id: true, caseNo: true },
    });
    await prisma.workOrder.create({
      data: { tenantId, workOrderNo: nums.workOrderNo ?? null, caseId: corr.id, status: WorkOrderStatus.CREADA, assignedToId: userId },
    });
    await prisma.caseEvent.create({
      data: {
        caseId: corr.id,
        type: CaseEventType.CREATED,
        message: "Correctivo generado desde RVR (prioridad de correctivo).",
        meta: { by: userId, source: "rvr-corrective-priority", reason, detail },
      },
    });
    return NextResponse.json({ ok: true, caseId: corr.id, caseNo: corr.caseNo });
  } catch (e) {
    console.error("RVR_CORRECTIVE_PRIORITY_FAILED", e);
    return NextResponse.json({ error: "No se pudo crear el correctivo." }, { status: 500 });
  }
}
