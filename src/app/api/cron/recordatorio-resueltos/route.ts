export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { CaseEventType, CaseStatus, CaseType, Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTelegramGroup } from "@/lib/telegram-notify";

// Recordatorio de validación: avisa al grupo de Telegram los casos que llevan
// 3+ días en RESUELTO sin que el coordinador los valide (cierre). Pensado para
// correr una vez al día (ver docs/mantenimiento-telemetria.md). Idempotente:
// no vuelve a avisar por el mismo caso hasta pasados otros 3 días.

const DIAS_ESPERA = 3;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret");

  if (secret) {
    if (header !== secret) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
  } else {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role as Role | undefined;
    if (!session?.user || (role !== Role.ADMIN && role !== Role.BACKOFFICE)) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - DIAS_ESPERA * 24 * 60 * 60 * 1000);

  // Casos en RESUELTO sin actividad reciente (3+ días sin ninguna edición).
  const pendientes = await prisma.case.findMany({
    where: {
      status: CaseStatus.RESUELTO,
      type: { in: [CaseType.PREVENTIVO, CaseType.CORRECTIVO] },
      updatedAt: { lt: cutoff },
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
    select: {
      id: true,
      caseNo: true,
      title: true,
      updatedAt: true,
      bus: { select: { code: true } },
    },
  });

  if (pendientes.length === 0) {
    return NextResponse.json({ ok: true, pendientes: 0, avisados: 0 });
  }

  // No repetir el aviso del mismo caso hasta pasados otros DIAS_ESPERA días.
  const yaAvisados = await prisma.caseEvent.findMany({
    where: {
      caseId: { in: pendientes.map((c) => c.id) },
      type: CaseEventType.NOTIFIED,
      createdAt: { gte: cutoff },
      meta: { path: ["reminderResueltos"], equals: true },
    },
    select: { caseId: true },
  });
  const avisadosSet = new Set(yaAvisados.map((e) => e.caseId));
  const porAvisar = pendientes.filter((c) => !avisadosSet.has(c.id));

  if (porAvisar.length === 0) {
    return NextResponse.json({ ok: true, pendientes: pendientes.length, avisados: 0 });
  }

  const dias = (d: Date) => Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  const lineas = porAvisar
    .slice(0, 20)
    .map((c) => `• Caso ${c.caseNo ?? "s/n"} · Bus ${c.bus.code} · ${dias(c.updatedAt)} días — ${c.title.slice(0, 60)}`);
  const extra = porAvisar.length > 20 ? `\n… y ${porAvisar.length - 20} más.` : "";

  const texto =
    `⏰ *Casos pendientes de validación*\n` +
    `Llevan ${DIAS_ESPERA}+ días en RESUELTO sin que el coordinador los cierre:\n\n` +
    lineas.join("\n") +
    extra;

  try {
    await sendTelegramGroup(texto);
  } catch (error) {
    console.error("RECORDATORIO_RESUELTOS_TELEGRAM_FAILED", error);
    return NextResponse.json({ error: "No se pudo enviar el aviso a Telegram" }, { status: 502 });
  }

  // Registrar el aviso en cada caso (para no repetirlo y que quede trazabilidad).
  await prisma.caseEvent.createMany({
    data: porAvisar.map((c) => ({
      caseId: c.id,
      type: CaseEventType.NOTIFIED,
      message: "Recordatorio enviado al grupo: caso pendiente de validación",
      meta: { reminderResueltos: true, auto: true },
    })),
  });

  return NextResponse.json({ ok: true, pendientes: pendientes.length, avisados: porAvisar.length });
}
