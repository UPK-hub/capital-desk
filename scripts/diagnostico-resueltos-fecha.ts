/**
 * Diagnóstico (solo lectura): por qué el tablero muestra un pico de "resueltos"
 * en una fecha. Lista los casos CERRADO/RESUELTO cuya fecha de resolución (último
 * evento de cambio de estado; si no, la finalización de la OT) cae en la fecha
 * dada, y muestra de dónde sale esa fecha (para identificar el proceso en bloque).
 *
 *   npm run diag:resueltos
 *   npm run diag:resueltos -- --fecha 2026-06-29
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus } from "@prisma/client";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const COT_MS = 5 * 3600 * 1000;
function cotKey(d: Date): string {
  return new Date(d.getTime() - COT_MS).toISOString().slice(0, 10);
}

async function main() {
  const fecha = arg("--fecha") || "2026-06-29";
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error("No se encontró el tenant.");
    process.exit(1);
  }

  const done = await prisma.case.findMany({
    where: { tenantId: tenant.id, status: { in: [CaseStatus.RESUELTO, CaseStatus.CERRADO] } },
    select: {
      caseNo: true,
      type: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      workOrder: { select: { finishedAt: true } },
      events: {
        where: {
          type: CaseEventType.STATUS_CHANGE,
          OR: [
            { message: { contains: "cerrad", mode: "insensitive" } },
            { message: { contains: "resuelt", mode: "insensitive" } },
          ],
          NOT: {
            OR: [
              { message: { contains: "backfill", mode: "insensitive" } },
              { message: { contains: "unific", mode: "insensitive" } },
            ],
          },
        },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true, message: true, meta: true },
      },
    },
  });

  // Misma lógica que el tablero: finalización de la OT, o el PRIMER cierre real.
  const resolvedAtOf = (c: (typeof done)[number]): Date | null =>
    c.workOrder?.finishedAt ?? c.events[0]?.createdAt ?? null;

  const hits = done.filter((c) => {
    const r = resolvedAtOf(c);
    return r != null && cotKey(r) === fecha;
  });

  console.log(`\n=== Casos con fecha de resolución = ${fecha} : ${hits.length} ===\n`);

  const byType: Record<string, number> = {};
  for (const c of hits) byType[c.type] = (byType[c.type] || 0) + 1;
  console.log("Por tipo:", byType);

  // Mes de CREACIÓN de esos casos: si están repartidos en muchos meses, fue una
  // importación/cierre masivo (la fecha 23/06 no sería la resolución real); si son
  // todos del mismo mes cercano, es un lote real de trabajo.
  const byCreatedMonth: Record<string, number> = {};
  for (const c of hits) {
    const k = cotKey(c.createdAt).slice(0, 7);
    byCreatedMonth[k] = (byCreatedMonth[k] || 0) + 1;
  }
  console.log("Por mes de creación:", byCreatedMonth);

  let conSC = 0;
  let conFinished = 0;
  let sinNada = 0;
  const byMsg: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const c of hits) {
    const sc = c.events[0];
    if (sc) {
      conSC++;
      const m = (sc.message || "").slice(0, 70);
      byMsg[m] = (byMsg[m] || 0) + 1;
      const src = ((sc.meta ?? {}) as any)?.source || "(sin source)";
      bySource[String(src)] = (bySource[String(src)] || 0) + 1;
    } else if (c.workOrder?.finishedAt) {
      conFinished++;
    } else {
      sinNada++;
    }
  }
  console.log(`\nFuente de la fecha:  STATUS_CHANGE ese día = ${conSC}   |   OT.finishedAt = ${conFinished}   |   sin señal = ${sinNada}`);

  console.log("\nMensajes de esos cambios de estado (top 12):");
  Object.entries(byMsg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([m, n]) => console.log(`  ${String(n).padStart(4)}×  ${m}`));

  console.log("\nmeta.source de esos eventos:", bySource);

  console.log("\nEjemplos:");
  hits.slice(0, 10).forEach((c) => {
    const sc = c.events[0];
    console.log(
      `  CASO-${String(c.caseNo ?? "").padStart(3, "0")}  ${c.type}/${c.status}  |  SC=${sc ? cotKey(sc.createdAt) + " '" + (sc.message || "").slice(0, 45) + "'" : "—"}  |  OT.fin=${c.workOrder?.finishedAt ? cotKey(c.workOrder.finishedAt) : "—"}  |  creado=${cotKey(c.createdAt)}`
    );
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
