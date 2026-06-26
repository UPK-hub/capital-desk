/**
 * Corrige la FECHA DE RESOLUCIÓN de las NOVEDADES cerradas que se crearon por
 * migración sin evento de cierre (por eso la bandeja muestra "—" o la fecha de hoy).
 *
 * Para cada NOVEDAD en estado RESUELTO/CERRADO que NO tenga ya un evento
 * STATUS_CHANGE, le crea uno con la FECHA REAL DE CIERRE DEL CORRECTIVO enlazado:
 *     correctivo.workOrder.finishedAt  ?? último STATUS_CHANGE del correctivo
 *     ?? correctivo.updatedAt
 * Así la columna "Resolución" muestra la fecha real y no "—" ni hoy.
 *
 * Idempotente: si la novedad ya tiene un STATUS_CHANGE, se omite.
 * DRY-RUN por defecto (no escribe nada). Muestra la fecha que pondría por caso.
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

async function main() {
  const apply = process.argv.includes("--apply");
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: "CAPITALBUS" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error("✗ No se encontró el tenant."); process.exit(1); }
  const tenantId = tenant.id;

  console.log(`\n=== Corregir fecha de resolución de novedades cerradas ===`);
  console.log(`Modo: ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}\n`);

  // Mapa novedadId -> correctivo (vía el evento de enlace meta.sourceCaseId del correctivo).
  const correctivos = await prisma.case.findMany({
    where: { tenantId, type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] } },
    select: {
      id: true, caseNo: true, status: true, updatedAt: true,
      workOrder: { select: { finishedAt: true } },
      events: { orderBy: { createdAt: "asc" }, select: { type: true, meta: true, createdAt: true } },
    },
  });
  const corrByNovedad = new Map<string, (typeof correctivos)[number]>();
  for (const c of correctivos) {
    const src = c.events.map((e) => metaVal(e.meta, "sourceCaseId")).find(Boolean);
    if (src && !corrByNovedad.has(src)) corrByNovedad.set(src, c);
  }

  // Novedades cerradas.
  const novedades = await prisma.case.findMany({
    where: { tenantId, type: CaseType.NOVEDAD, status: { in: CLOSED } },
    orderBy: { caseNo: "asc" },
    select: { id: true, caseNo: true, status: true, updatedAt: true, events: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true } } },
  });

  let arreglar = 0, yaTienen = 0, sinCorrectivo = 0, sinFecha = 0;
  const detalle: string[] = [];

  for (const n of novedades) {
    const yaResuelta = !!lastStatusChangeAt(n.events);
    if (yaResuelta) { yaTienen++; continue; }

    const corr = corrByNovedad.get(n.id);
    if (!corr) { sinCorrectivo++; detalle.push(`#${n.caseNo} ${n.status} → SIN correctivo enlazado (no se puede tomar fecha)`); continue; }

    const closeDate = corr.workOrder?.finishedAt ?? lastStatusChangeAt(corr.events) ?? corr.updatedAt ?? null;
    const fuente = corr.workOrder?.finishedAt ? "OT.finishedAt" : lastStatusChangeAt(corr.events) ? "corr.STATUS_CHANGE" : "corr.updatedAt";
    if (!closeDate) { sinFecha++; detalle.push(`#${n.caseNo} ${n.status} → correctivo #${corr.caseNo} SIN fecha de cierre`); continue; }

    if (apply) {
      await prisma.caseEvent.create({
        data: {
          caseId: n.id, type: CaseEventType.STATUS_CHANGE, createdAt: closeDate,
          message: `Estado: ${n.status}`,
          meta: { status: n.status, fixedResolution: true, fromCorrectivo: corr.caseNo, source: fuente },
        },
      });
    }
    arreglar++;
    detalle.push(`#${n.caseNo} ${n.status} → resolución=${fmt(closeDate)} (de correctivo #${corr.caseNo}, ${fuente})`);
  }

  console.log(`--- ${apply ? "Corregidas" : "Se corregirían"} (${arreglar}) ---`);
  for (const d of detalle.slice(0, 80)) console.log("  • " + d);
  if (detalle.length > 80) console.log(`  … y ${detalle.length - 80} más`);

  console.log(`\n=== Totales ===`);
  console.log(`  Novedades cerradas:                 ${novedades.length}`);
  console.log(`  ${apply ? "Fecha de resolución corregida:" : "Fecha de resolución a corregir:"}    ${arreglar}`);
  console.log(`  Ya tenían fecha (omitidas):         ${yaTienen}`);
  if (sinCorrectivo) console.log(`  Sin correctivo enlazado:            ${sinCorrectivo}`);
  if (sinFecha) console.log(`  Correctivo sin fecha de cierre:     ${sinFecha}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main().then(() => process.exit(0)).catch((err) => { console.error("✗ Falló:", err); process.exit(1); });
