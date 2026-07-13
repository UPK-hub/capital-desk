import { prisma } from "@/lib/prisma";
import { CaseType } from "@prisma/client";

/**
 * Estandariza el TÍTULO de los preventivos de JUNIO 2026 al formato:
 *   "Mantenimiento preventivo K#### / Junio"
 *
 * Dry-run por defecto; --apply para escribir.
 * Uso:  npm run fix:titulos-junio
 *       npm run fix:titulos-junio -- --apply
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const cases = await prisma.case.findMany({
    where: { type: CaseType.PREVENTIVO, createdAt: { gte: desde, lt: hasta } },
    select: { id: true, caseNo: true, title: true, bus: { select: { code: true } } },
    orderBy: { caseNo: "asc" },
  });

  let cambiar = 0;
  let yaOk = 0;
  for (const c of cases) {
    const code = c.bus?.code;
    if (!code) continue;
    const nuevo = `Mantenimiento preventivo ${code} / Junio`;
    if (c.title === nuevo) {
      yaOk++;
      continue;
    }
    cambiar++;
    console.log(`  #${c.caseNo ?? "s/n"}  "${c.title}"  ->  "${nuevo}"`);
    if (APPLY) {
      await prisma.case.update({ where: { id: c.id }, data: { title: nuevo } });
    }
  }

  console.log("");
  console.log(`Total: ${cases.length} · ${APPLY ? "renombrados" : "por renombrar"}: ${cambiar} · ya estaban bien: ${yaOk}`);
  if (!APPLY && cambiar) console.log("SIMULACRO: nada cambiado. Usa -- --apply para aplicar.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
