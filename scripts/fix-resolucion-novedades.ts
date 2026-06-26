/**
 * Corrige las FECHAS de las NOVEDADES creadas por migración para que reflejen la
 * vida real del correctivo enlazado (y no la fecha de hoy en que se migraron).
 *
 * Por cada NOVEDAD enlazada a un correctivo, alinea con el correctivo:
 *   - createdAt  = correctivo.createdAt                (fecha de apertura)
 *   - updatedAt  = fecha real de cierre                (para el tablero "resueltos/atendidos",
 *                  que se calcula por updatedAt en summary.ts)
 *   - evento STATUS_CHANGE en la fecha de cierre       (para la columna "Resolución" de la tabla)
 *
 * Fecha de cierre = correctivo.workOrder.finishedAt ?? último STATUS_CHANGE del
 * correctivo ?? correctivo.updatedAt. Solo aplica a novedades RESUELTAS/CERRADAS.
 * Las abiertas (Nuevo) solo se alinean en createdAt; no llevan fecha de cierre.
 *
 * Idempotente (no duplica eventos ni reescribe fechas ya correctas).
 * DRY-RUN por defecto. Muestra, por caso, las fechas actuales y las nuevas.
 *   npx tsx scripts/fix-resolucion-novedades.ts
 *   npx tsx scripts/fix-resolucion-novedades.ts --apply
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType, CaseStatus } from "@prisma/client";

const CLOSED = [CaseStatus.RESUELTO, CaseStatus.CERRADO];

function metaVal(meta: unknown, field: string): string | null {
  const v = ((meta ?? {}) as any)?.[field];
  return v && String(v).trim() ? String(v).trim() : null;
}
function lastStatusChangeAt(events: Array<{ type: any; createdAt: Date }>): Date | null {
  for (let i = events.length - 1; i >= 0; i -= 1) if (events[i].type === CaseEventType.STATUS_CHANGE) return events[i].createdAt;
  return null;
}
function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "(sin fecha)";
}
function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return !!a && !!b && a.getTime() === b.getTime();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: "CAPITALBUS" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error("✗ No se encontró el tenant."); process.exit(1); }
  const tenantId = tenant.id;

  console.log(`\n=== Alinear fechas de novedades migradas con su correctivo ===`);
  console.log(`Modo: ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}\n`);

  // Mapa novedadId -> correctivo (vía el evento de enlace meta.sourceCaseId).
  const correctivos = await prisma.case.findMany({
    where: { tenantId, type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] } },
    select: {
      id: true, caseNo: true, status: true, createdAt: true, updatedAt: true,
      workOrder: { select: { finishedAt: true } },
      events: { orderBy: { createdAt: "asc" }, select: { type: true, meta: true, createdAt: true } },
    },
  });
  const corrByNovedad = new Map<string, (typeof correctivos)[number]>();
  for (const c of correctivos) {
    const src = c.events.map((e) => metaVal(e.meta, "sourceCaseId")).find(Boolean);
    if (src && !corrByNovedad.has(src)) corrByNovedad.set(src, c);
  }

  // Todas las novedades que tengan correctivo enlazado (las migradas).
  const novedades = await prisma.case.findMany({
    where: { tenantId, type: CaseType.NOVEDAD },
    orderBy: { caseNo: "asc" },
    select: { id: true, caseNo: true, status: true, createdAt: true, updatedAt: true, events: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true } } },
  });

  let eventoFix = 0, updFix = 0, creFix = 0, sinCorr = 0;
  const detalle: string[] = [];

  for (const n of novedades) {
    const corr = corrByNovedad.get(n.id);
    if (!corr) { sinCorr++; continue; } // novedad no migrada / sin correctivo: no se toca

    const isClosed = (CLOSED as string[]).includes(n.status);
    const closeDate = isClosed ? (corr.workOrder?.finishedAt ?? lastStatusChangeAt(corr.events) ?? corr.updatedAt ?? null) : null;
    const openDate = corr.createdAt ?? null;

    const hasStatusChange = !!lastStatusChangeAt(n.events);
    const needEvent = isClosed && !!closeDate && !hasStatusChange;
    const needUpd = !!closeDate && !sameInstant(n.updatedAt, closeDate);
    const needCre = !!openDate && !sameInstant(n.createdAt, openDate);

    if (!needEvent && !needUpd && !needCre) continue;

    const fuente = corr.workOrder?.finishedAt ? "OT" : lastStatusChangeAt(corr.events) ? "STATUS_CHANGE" : "updatedAt";

    if (apply) {
      if (needEvent && closeDate) {
        await prisma.caseEvent.create({
          data: {
            caseId: n.id, type: CaseEventType.STATUS_CHANGE, createdAt: closeDate,
            message: `Estado: ${n.status}`,
            meta: { status: n.status, fixedResolution: true, fromCorrectivo: corr.caseNo, source: fuente },
          },
        });
      }
      // createdAt y/o updatedAt con SQL crudo (evita que @updatedAt lo pise con now()).
      if (needCre && needUpd && openDate && closeDate) {
        await prisma.$executeRaw`UPDATE "Case" SET "createdAt" = ${openDate}, "updatedAt" = ${closeDate} WHERE "id" = ${n.id}`;
      } else if (needUpd && closeDate) {
        await prisma.$executeRaw`UPDATE "Case" SET "updatedAt" = ${closeDate} WHERE "id" = ${n.id}`;
      } else if (needCre && openDate) {
        await prisma.$executeRaw`UPDATE "Case" SET "createdAt" = ${openDate} WHERE "id" = ${n.id}`;
      }
    }

    if (needEvent) eventoFix++;
    if (needUpd) updFix++;
    if (needCre) creFix++;

    const acc: string[] = [];
    if (needCre) acc.push(`apertura ${fmt(n.createdAt)}→${fmt(openDate)}`);
    if (needUpd) acc.push(`cierre/upd ${fmt(n.updatedAt)}→${fmt(closeDate)}`);
    if (needEvent) acc.push(`+evento resolución ${fmt(closeDate)}`);
    detalle.push(`#${n.caseNo} ${n.status} (corr #${corr.caseNo}, ${fuente}): ${acc.join(" · ")}`);
  }

  console.log(`--- ${apply ? "Corregidas" : "Se corregirían"} (${detalle.length}) ---`);
  for (const d of detalle.slice(0, 90)) console.log("  • " + d);
  if (detalle.length > 90) console.log(`  … y ${detalle.length - 90} más`);

  console.log(`\n=== Totales ===`);
  console.log(`  Novedades con correctivo:           ${novedades.length - sinCorr}`);
  console.log(`  ${apply ? "Evento de resolución creado:" : "Evento de resolución a crear:"}      ${eventoFix}`);
  console.log(`  ${apply ? "Fecha de cierre (updatedAt) fijada:" : "Fecha de cierre (updatedAt) a fijar:"} ${updFix}`);
  console.log(`  ${apply ? "Fecha de apertura (createdAt) fijada:" : "Fecha de apertura (createdAt) a fijar:"} ${creFix}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main().then(() => process.exit(0)).catch((err) => { console.error("✗ Falló:", err); process.exit(1); });
