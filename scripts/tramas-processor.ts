/**
 * Procesador CONTINUO de tramas (para correr bajo pm2, como los bots).
 *
 * Llama a processInboundTelemetryBatch en bucle para que la tabla
 * `BusTelemetryState` (última posición / lastSeenAt que muestra el módulo de
 * Telemetría) se mantenga al día. Las tramas crudas llegan siempre; este proceso
 * es el que las "procesa" y actualiza el estado por bus.
 *
 * No necesita secreto: usa Prisma directo (toma DATABASE_URL del .env como los
 * demás scripts). Adaptativo: si procesa un lote LLENO sigue de inmediato
 * (ponerse al día); si no hay pendientes, espera IDLE_MS y vuelve a mirar.
 *
 * Variables opcionales (.env): TRAMAS_PROC_LIMIT (def. 1000), TRAMAS_PROC_IDLE_MS (def. 5000).
 *   pm2 start ecosystem.config.cjs --only tramas-processor
 */
import { prisma } from "@/lib/prisma";
import { processInboundTelemetryBatch } from "@/lib/integrations/tramas";
import { IntegrationInboundStatus } from "@prisma/client";

const LIMIT = Number(process.env.TRAMAS_PROC_LIMIT || 1000);
const IDLE_MS = Number(process.env.TRAMAS_PROC_IDLE_MS || 5000);
const MAX_TENANTS = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tick(): Promise<number> {
  // Tenants con tramas pendientes (RECEIVED/ERROR), como hace el endpoint cron.
  const rows = await prisma.integrationInboundEvent.findMany({
    where: { status: { in: [IntegrationInboundStatus.RECEIVED, IntegrationInboundStatus.ERROR] }, retries: { lt: 5 } },
    select: { tenantId: true },
    distinct: ["tenantId"],
    take: MAX_TENANTS,
  });
  if (rows.length === 0) return 0;

  let picked = 0;
  for (const r of rows) {
    const res = await processInboundTelemetryBatch({ tenantId: r.tenantId, limit: LIMIT });
    picked += res.picked ?? 0;
  }
  return picked;
}

async function main() {
  console.log(`[tramas-processor] iniciado · limit=${LIMIT} idle=${IDLE_MS}ms`);
  for (;;) {
    try {
      const picked = await tick();
      if (picked > 0) console.log(`[tramas-processor] ${new Date().toISOString()} lote procesado (picked=${picked})`);
      // Si el lote vino lleno, hay backlog → seguir de inmediato. Si no, descansar.
      if (picked < LIMIT) await sleep(IDLE_MS);
    } catch (err) {
      console.error("[tramas-processor] error en el bucle:", err);
      await sleep(IDLE_MS);
    }
  }
}

main().catch((err) => {
  console.error("[tramas-processor] fatal:", err);
  process.exit(1);
});
