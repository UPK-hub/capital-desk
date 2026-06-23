/**
 * Backfill: cierra los casos de tipo SOLICITUD_DESCARGA_VIDEO cuyo
 * VideoDownloadRequest ya está en COMPLETADO pero cuyo Caso quedó en un
 * estado NO cerrado (típicamente NUEVO).
 *
 * Contexto: la lógica de cierre automático (PUT /api/video-requests/[id])
 * pasa el Caso a CERRADO cuando la solicitud llega a COMPLETADO. Los casos
 * creados/cerrados ANTES de existir esa lógica quedaron desincronizados:
 * aparecen como "Nuevo" en el listado de Casos aunque su video ya fue
 * entregado. Este script los corrige replicando el mismo cierre + CaseEvent.
 *
 * Es IDEMPOTENTE: solo toca casos que aún no están CERRADO/RESUELTO.
 * Por defecto corre en DRY-RUN (no escribe nada); usa --apply para aplicar.
 *
 * Uso:
 *   npx tsx scripts/backfill-video-cases-cerrado.ts                   # dry-run (solo lista)
 *   npx tsx scripts/backfill-video-cases-cerrado.ts --apply           # aplica a todos los tenants
 *   npx tsx scripts/backfill-video-cases-cerrado.ts --apply --tenant CAPITALBUS
 *
 * o vía npm:
 *   npm run backfill:video-cases -- --apply
 */
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseEventType, VideoCaseStatus } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tenantIdx = args.indexOf("--tenant");
  const tenantCode = tenantIdx >= 0 ? args[tenantIdx + 1] : undefined;

  // Resolver tenant opcional por código (ej: CAPITALBUS).
  let tenantId: string | undefined;
  if (tenantCode) {
    const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode } });
    if (!tenant) {
      console.error(`✗ No se encontró ningún tenant con code="${tenantCode}".`);
      process.exit(1);
    }
    tenantId = tenant.id;
  }

  // Solicitudes de video COMPLETADO cuyo caso NO está cerrado todavía.
  const requests = await prisma.videoDownloadRequest.findMany({
    where: {
      status: VideoCaseStatus.COMPLETADO,
      case: {
        status: { notIn: [CaseStatus.CERRADO, CaseStatus.RESUELTO] },
        ...(tenantId ? { tenantId } : {}),
      },
    },
    include: { case: { include: { bus: true } } },
  });

  // Orden estable por número de caso para una salida legible.
  requests.sort((a, b) => (a.case.caseNo ?? 0) - (b.case.caseNo ?? 0));

  console.log("");
  console.log(`Modo:   ${apply ? "APLICAR (se escribirán cambios)" : "DRY-RUN (solo lectura)"}`);
  console.log(`Tenant: ${tenantCode ?? "(todos)"}`);
  console.log(`Casos por resolver (video COMPLETADO + caso no resuelto): ${requests.length}`);
  console.log("");

  for (const vr of requests) {
    const c = vr.case;
    console.log(
      `  Caso #${c.caseNo ?? c.id}  bus=${c.bus.code}  estado=${c.status} -> RESUELTO  | ${c.title}`
    );
  }

  if (requests.length === 0) {
    console.log("Nada por hacer: todos los casos con video completado ya están cerrados.");
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log("");
    console.log(
      `DRY-RUN: no se modificó nada. Vuelve a ejecutar con --apply para cerrar los ${requests.length} casos.`
    );
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const vr of requests) {
    const fromStatus = vr.case.status;
    await prisma.$transaction([
      prisma.case.update({
        where: { id: vr.caseId },
        data: { status: CaseStatus.RESUELTO },
      }),
      prisma.caseEvent.create({
        data: {
          caseId: vr.caseId,
          type: CaseEventType.STATUS_CHANGE,
          message:
            "Caso resuelto automáticamente (backfill) al detectar solicitud de video completada",
          meta: {
            backfill: true,
            from: fromStatus,
            to: CaseStatus.RESUELTO,
            source: "backfill-video-cases-cerrado",
          },
        },
      }),
    ]);
    updated += 1;
  }

  console.log("");
  console.log(`✓ Listo. Casos resueltos: ${updated}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Backfill falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
