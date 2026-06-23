import { prisma } from "@/lib/prisma";
import { recomputeDay } from "@/lib/telemetry/rollup";
import { bogToday, addDaysLabel, bogDayKey } from "@/lib/telemetry/tz";

// Backfill del resumen diario de telemetría (por día de Colombia, UTC-5).
// Uso: npm run rollup:backfill            -> últimos 90 días
//      npm run rollup:backfill -- 180     -> últimos 180 días
async function main() {
  const days = Number(process.argv[2] ?? process.env.DAYS ?? 90);
  const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
  const today = bogToday();

  console.log(`Backfill de rollup (día Colombia): ${days} días · ${tenants.length} tenant(s)`);
  for (const t of tenants) {
    // Limpia el resumen previo del tenant (evita días con zona horaria vieja).
    await prisma.telemetryDailyRollup.deleteMany({ where: { tenantId: t.id } });
    for (let i = days; i >= 0; i--) {
      const label = addDaysLabel(today, -i);
      const t0 = Date.now();
      await recomputeDay(t.id, label);
      console.log(`[${t.code}] ${bogDayKey(label)} ok (${Date.now() - t0} ms)`);
    }
  }
  console.log("Backfill completo.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Backfill falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
