import { prisma } from "@/lib/prisma";
import { recomputeDay } from "@/lib/telemetry/rollup";

// Backfill del resumen diario de telemetría.
// Uso: npm run rollup:backfill            -> últimos 90 días
//      npm run rollup:backfill -- 180     -> últimos 180 días
async function main() {
  const days = Number(process.argv[2] ?? process.env.DAYS ?? 90);
  const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  console.log(`Backfill de rollup: ${days} días · ${tenants.length} tenant(s)`);
  for (const t of tenants) {
    for (let i = days; i >= 0; i--) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - i);
      const t0 = Date.now();
      await recomputeDay(t.id, day);
      console.log(`[${t.code}] ${day.toISOString().slice(0, 10)} ok (${Date.now() - t0} ms)`);
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
