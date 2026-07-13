import { prisma } from "@/lib/prisma";
import { recomputeDay } from "@/lib/telemetry/rollup";
import { bogToday, addDaysLabel, labelKey } from "@/lib/telemetry/tz";

// Rollup DIARIO de telemetría: recalcula solo ayer y hoy (día de Colombia)
// para todos los tenants. Pensado para correr automático cada madrugada
// (ver docs/mantenimiento-telemetria.md). No borra datos históricos:
// recomputeDay solo reemplaza el resumen del día que recalcula.
//
// Uso: npm run rollup:daily
async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
  const today = bogToday();
  const days = [addDaysLabel(today, -1), today];

  console.log(`Rollup diario · ${tenants.length} tenant(s) · días: ${days.map(labelKey).join(", ")}`);
  for (const t of tenants) {
    for (const label of days) {
      const t0 = Date.now();
      await recomputeDay(t.id, label);
      console.log(`[${t.code}] ${labelKey(label)} ok (${Date.now() - t0} ms)`);
    }
  }
  console.log("Rollup diario completo.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Rollup diario falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
