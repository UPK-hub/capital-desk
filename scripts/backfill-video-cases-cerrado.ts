/**
 * Backfill: marca como RESUELTO los casos de SOLICITUD_DESCARGA_VIDEO cuyo video
 * ya fue entregado (solicitud COMPLETADO o descarga DESCARGA_REALIZADA), y los deja
 * con la FECHA REAL DE CIERRE (no la de hoy) para que los reportes por mes salgan bien.
 *
 *  - Casos aún no resueltos -> pasan a RESUELTO + evento de trazabilidad.
 *  - Casos ya resueltos (p. ej. por un backfill anterior con fecha "hoy") -> se les
 *    corrige la fecha (Case.updatedAt) a la fecha real de cierre.
 *  - No toca casos ya CERRADO (archivados).
 *
 * La fecha real = fecha del evento de completado/descarga; si no hay, la última
 * actualización de la solicitud. Se fija en Case.updatedAt vía SQL crudo (Prisma
 * no permite sobrescribir @updatedAt).
 *
 * Idempotente. DRY-RUN por defecto; --apply para aplicar.
 *   npm run backfill:video-cases                 # dry-run
 *   npm run backfill:video-cases -- --apply
 *   npm run backfill:video-cases -- --apply --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseEventType, VideoCaseStatus, VideoDownloadStatus } from "@prisma/client";

function completionDate(vr: any): Date {
  const evts: any[] = vr.events ?? [];
  const matches = evts.filter((e) => {
    const to = (e.meta as any)?.to;
    return (
      (e.type === "DOWNLOAD_STATUS_CHANGE" && to === "DESCARGA_REALIZADA") ||
      (e.type === "STATUS_CHANGE" && to === "COMPLETADO")
    );
  });
  if (matches.length) {
    return matches.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt;
  }
  return vr.updatedAt ?? vr.case.createdAt;
}

async function setUpdatedAt(caseId: string, when: Date, caseNo: number | null) {
  try {
    await prisma.$executeRawUnsafe(`UPDATE "Case" SET "updatedAt" = $1 WHERE "id" = $2`, when, caseId);
  } catch (e: any) {
    console.warn(`  ! No se pudo fijar la fecha de cierre del caso ${caseNo}: ${e?.message ?? e}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tenantIdx = args.indexOf("--tenant");
  const tenantCode = tenantIdx >= 0 ? args[tenantIdx + 1] : undefined;

  let tenantId: string | undefined;
  if (tenantCode) {
    const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode } });
    if (!tenant) {
      console.error(`✗ No se encontró ningún tenant con code="${tenantCode}".`);
      process.exit(1);
    }
    tenantId = tenant.id;
  }

  // Video entregado (COMPLETADO o DESCARGA_REALIZADA) + caso NO archivado (CERRADO).
  const requests = await prisma.videoDownloadRequest.findMany({
    where: {
      OR: [
        { status: VideoCaseStatus.COMPLETADO },
        { downloadStatus: VideoDownloadStatus.DESCARGA_REALIZADA },
      ],
      case: {
        status: { not: CaseStatus.CERRADO },
        ...(tenantId ? { tenantId } : {}),
      },
    },
    include: { case: { include: { bus: true } }, events: true },
  });

  requests.sort((a, b) => (a.case.caseNo ?? 0) - (b.case.caseNo ?? 0));

  const toResolve = requests.filter((vr) => vr.case.status !== CaseStatus.RESUELTO);
  const toRedate = requests.filter((vr) => vr.case.status === CaseStatus.RESUELTO);

  console.log("");
  console.log(`Modo:   ${apply ? "APLICAR (se escribirán cambios)" : "DRY-RUN (solo lectura)"}`);
  console.log(`Tenant: ${tenantCode ?? "(todos)"}`);
  console.log(`A resolver (caso no resuelto): ${toResolve.length}`);
  console.log(`A corregir fecha (ya resueltos): ${toRedate.length}`);
  console.log("");

  for (const vr of requests) {
    const c = vr.case;
    const when = completionDate(vr);
    const accion = c.status === CaseStatus.RESUELTO ? "re-fechar" : `${c.status} -> RESUELTO`;
    console.log(`  Caso #${c.caseNo ?? c.id}  bus=${c.bus.code}  ${accion}  cierre=${when.toISOString().slice(0, 10)}`);
  }

  if (requests.length === 0) {
    console.log("Nada por hacer.");
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log("");
    console.log("DRY-RUN: no se modificó nada. Vuelve a ejecutar con --apply para aplicar.");
    await prisma.$disconnect();
    return;
  }

  let resolved = 0;
  let redated = 0;
  for (const vr of requests) {
    const when = completionDate(vr);
    if (vr.case.status !== CaseStatus.RESUELTO) {
      const fromStatus = vr.case.status;
      await prisma.case.update({
        where: { id: vr.caseId },
        data: { status: CaseStatus.RESUELTO },
      });
      await prisma.caseEvent.create({
        data: {
          caseId: vr.caseId,
          type: CaseEventType.STATUS_CHANGE,
          createdAt: when,
          message: "Caso resuelto (backfill) al detectar el video entregado",
          meta: {
            backfill: true,
            from: fromStatus,
            to: CaseStatus.RESUELTO,
            closedAt: when.toISOString(),
            source: "backfill-video-cases",
          },
        },
      });
      await setUpdatedAt(vr.caseId, when, vr.case.caseNo);
      resolved += 1;
    } else {
      await setUpdatedAt(vr.caseId, when, vr.case.caseNo);
      redated += 1;
    }
  }

  console.log("");
  console.log(`✓ Listo. Resueltos: ${resolved} · Fechas corregidas: ${redated}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Backfill falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
