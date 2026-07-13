import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";

/**
 * Cuenta los preventivos de JUNIO 2026 (hora Colombia) y los desglosa:
 * importados vs. creados por bot/web, con/sin OT cargada, y evidencias.
 * Solo lectura, no cambia nada.
 *
 * Uso: npm run contar:preventivos-junio
 */
async function main() {
  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const cases = await prisma.case.findMany({
    where: { type: CaseType.PREVENTIVO, createdAt: { gte: desde, lt: hasta } },
    orderBy: { caseNo: "asc" },
    select: {
      id: true,
      caseNo: true,
      status: true,
      createdAt: true,
      bus: { select: { code: true } },
      workOrder: { select: { orderFilePath: true } },
      _count: { select: { chatMessages: true } },
      events: {
        where: { type: CaseEventType.CREATED },
        select: { meta: true },
      },
    },
  });

  let importados = 0;
  let botWeb = 0;
  let conOt = 0;
  let conEvidencias = 0;
  const botWebList: string[] = [];

  for (const c of cases) {
    const esImportado = c.events.some((e) => ((e.meta ?? {}) as any)?.source === "import-preventivos");
    if (esImportado) importados++;
    else {
      botWeb++;
      botWebList.push(`#${c.caseNo ?? "s/n"} ${c.bus?.code ?? "?"} (${c.createdAt.toISOString().slice(0, 10)}, ${c.status}, OT=${c.workOrder?.orderFilePath ? "sí" : "no"}, evid=${c._count.chatMessages})`);
    }
    if (c.workOrder?.orderFilePath) conOt++;
    if (c._count.chatMessages > 0) conEvidencias++;
  }

  console.log(`\n=== Preventivos de junio 2026 ===`);
  console.log(`Total:                 ${cases.length}`);
  console.log(`  Importados:          ${importados}`);
  console.log(`  Del bot / web:       ${botWeb}`);
  console.log(`  Con OT cargada:      ${conOt}`);
  console.log(`  Con evidencias:      ${conEvidencias}`);
  console.log(`\n--- Detalle de los del bot/web (${botWeb}) ---`);
  for (const l of botWebList) console.log("  " + l);
  console.log("");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("El conteo falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
