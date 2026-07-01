/**
 * Genera la lista priorizada de la Revisión Remota del día (30 buses).
 * Pensado para correr AUTOMÁTICAMENTE cada mañana (Programador de tareas de
 * Windows a las 9:00 am, ejecutando `npm run rvr:generar` en la carpeta del app).
 * Idempotente: si ya se generó hoy, refresca la prioridad sin pisar lo revisado.
 *
 *   npm run rvr:generar
 *   npm run rvr:generar -- --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { generateDailyRvr } from "@/lib/rvr/generate";
import { asDateInput, parseDateInput } from "@/lib/rvr";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const tenantCode = arg("--tenant");
  const reviewDate = parseDateInput(asDateInput(new Date()))!;

  const tenants = tenantCode
    ? await prisma.tenant.findMany({ where: { code: tenantCode }, select: { id: true, code: true } })
    : await prisma.tenant.findMany({ select: { id: true, code: true } });

  if (tenants.length === 0) {
    console.error("No hay tenants.");
    process.exit(1);
  }

  for (const t of tenants) {
    try {
      const r = await generateDailyRvr(t.id, reviewDate);
      console.log(`✓ ${t.code}: RVR ${asDateInput(reviewDate)} — ${r.total} buses (${r.created} nuevos).`);
    } catch (e) {
      console.error(`✗ ${t.code}:`, e);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
