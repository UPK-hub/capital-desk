/**
 * Refrescador CONTINUO de posición por bus (para correr bajo pm2).
 *
 * Mantiene al día la tabla `BusTelemetryState` (última posición / lastSeenAt que
 * muestra el módulo de Telemetría) tomando la ÚLTIMA trama cruda de CADA bus.
 *
 * Por qué así: el volumen de tramas es altísimo y el procesamiento pesado (alarmas,
 * lifecycle, etc.) no alcanza a ponerse al día cronológicamente. La "última posición"
 * NO necesita procesar todo: solo necesita la trama más reciente de cada bus. Esto se
 * resuelve con UNA consulta indexada por (tenantId, busId, eventAt) cada pocos segundos.
 *
 * Idempotente y "solo avanza": nunca retrocede lastSeenAt (WHERE del ON CONFLICT).
 * Variables opcionales (.env): TRAMAS_REFRESH_MS (def. 20000).
 *   pm2 start ecosystem.config.cjs --only tramas-processor
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const REFRESH_MS = Number(process.env.TRAMAS_REFRESH_MS || 20000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function refreshTenant(tenantId: string): Promise<number> {
  // Última trama (cualquier estado) por bus → BusTelemetryState. Indexado por
  // (tenantId, busId, eventAt). El ON CONFLICT solo AVANZA lastSeenAt.
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "BusTelemetryState"
      ("busId","tenantId","lastSeenAt","lastEventAt","lastEventType","lastSeverity","lastMessage","lastPayload","createdAt","updatedAt")
    SELECT b.id, b."tenantId", t."receivedAt", t."eventAt", t."eventType", t."severity", t."message", t."payload", now(), now()
    FROM "Bus" b
    JOIN LATERAL (
      SELECT e."receivedAt", e."eventAt", e."eventType", e."severity", e."message", e."payload"
      FROM "IntegrationInboundEvent" e
      WHERE e."tenantId" = b."tenantId" AND e."busId" = b.id
        AND e."eventAt" >= now() - interval '3 days'
      ORDER BY e."eventAt" DESC
      LIMIT 1
    ) t ON true
    WHERE b."tenantId" = ${tenantId}
    ON CONFLICT ("busId") DO UPDATE SET
      "lastSeenAt"    = EXCLUDED."lastSeenAt",
      "lastEventAt"   = EXCLUDED."lastEventAt",
      "lastEventType" = EXCLUDED."lastEventType",
      "lastSeverity"  = EXCLUDED."lastSeverity",
      "lastMessage"   = EXCLUDED."lastMessage",
      "lastPayload"   = EXCLUDED."lastPayload",
      "updatedAt"     = now()
    WHERE "BusTelemetryState"."lastSeenAt" IS NULL
       OR EXCLUDED."lastSeenAt" >= "BusTelemetryState"."lastSeenAt"
  `);
}

async function main() {
  console.log(`[tramas-processor] refrescador de posición iniciado · cada ${REFRESH_MS}ms`);
  for (;;) {
    try {
      const t0 = Date.now();
      const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
      let total = 0;
      for (const t of tenants) total += await refreshTenant(t.id);
      console.log(`[tramas-processor] ${new Date().toISOString()} posición refrescada (buses=${total}) en ${Date.now() - t0}ms`);
    } catch (err) {
      console.error("[tramas-processor] error en el refresco:", err);
    }
    await sleep(REFRESH_MS);
  }
}

main().catch((err) => {
  console.error("[tramas-processor] fatal:", err);
  process.exit(1);
});
