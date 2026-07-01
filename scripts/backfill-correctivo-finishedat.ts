/**
 * Rellena WorkOrder.finishedAt de los correctivos YA CERRADOS que no lo tienen,
 * para que la "fecha de resolución" de sus novedades sea la fecha del cierre del
 * correctivo (la tabla de novedades toma resolvedAt = correctivo.workOrder.finishedAt).
 *
 * Fecha elegida por correctivo (en este orden):
 *   1) "Realizado" manual que puso el técnico (meta.realizadoEn, formato dd/mm/aaaa hh:mm)
 *   2) el momento del cierre (último evento STATUS_CHANGE del correctivo)
 *   3) updatedAt del caso (último recurso)
 *
 * DRY-RUN por defecto (no escribe nada). Idempotente: solo toca finishedAt nulo.
 *   npm run backfill:correctivo-finishedat
 *   npm run backfill:correctivo-finishedat -- --apply
 *   (opcional)  -- --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType } from "@prisma/client";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

// Parsea "dd/mm/aaaa hh:mm" (hora de Bogotá, UTC-5) a Date. null si no coincide.
function parseFechaCO(txt: string): Date | null {
  const m = (txt || "").trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const hh = m[4] != null ? Number(m[4]) : 12;
  const mi = m[5] != null ? Number(m[5]) : 0;
  const dt = new Date(Date.UTC(year, mm, dd, hh + 5, mi, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error("✗ No se encontró el tenant.");
    process.exit(1);
  }
  const tenantId = tenant.id;

  const corrs = await prisma.case.findMany({
    where: {
      tenantId,
      type: CaseType.CORRECTIVO,
      status: CaseStatus.CERRADO,
      workOrder: { is: { finishedAt: null } },
    },
    select: {
      id: true,
      caseNo: true,
      updatedAt: true,
      workOrder: { select: { id: true } },
      events: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, meta: true } },
    },
    orderBy: { caseNo: "asc" },
  });

  console.log(`Tenant ${tenant.code} — correctivos CERRADOS sin fecha de finalización: ${corrs.length}`);
  let updated = 0;
  for (const c of corrs) {
    if (!c.workOrder) continue;

    let realizadoEn: string | null = null;
    let lastStatusChange: Date | null = null;
    for (const e of c.events) {
      const meta = (e.meta ?? {}) as any;
      if (meta?.realizadoEn) realizadoEn = String(meta.realizadoEn);
      if (e.type === CaseEventType.STATUS_CHANGE) lastStatusChange = e.createdAt;
    }
    const manual = parseFechaCO(realizadoEn || "");
    const finishedAt = manual ?? lastStatusChange ?? c.updatedAt;
    const fuente = manual ? "manual" : lastStatusChange ? "cierre" : "updatedAt";
    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    console.log(
      `  ${ref}  →  ${finishedAt.toISOString()}  (${finishedAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })})  [${fuente}]`
    );

    if (apply) {
      await prisma.workOrder.update({ where: { id: c.workOrder.id }, data: { finishedAt } });
      updated++;
    }
  }

  console.log(apply ? `✓ Actualizados ${updated}.` : `(DRY-RUN) No se escribió nada. Corre con --apply para aplicar.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
