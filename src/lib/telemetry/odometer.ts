import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type OdometerRow = {
  busCode: string;
  plate: string | null;
  odometer: string | null;
  eventAt: Date | null;
  receivedAt: Date | null;
};

// Último kilometraje (campo kilometrosOdometro) reportado por cada bus.
// Acotado a los últimos 3 días para no escanear toda la tabla: por cada bus se
// toma su trama más reciente con odómetro usando el índice (tenantId, busCode,
// eventAt) + LIMIT 1. El resultado se cachea (ver getLatestOdometer) para que
// la consulta NO corra en cada carga y no sature el pool de conexiones.
async function queryLatestOdometer(tenantId: string): Promise<OdometerRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      busCode: string;
      plate: string | null;
      odometer: string | null;
      eventAt: Date | null;
      receivedAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT b."code" AS "busCode",
           b."plate" AS plate,
           t.odometer AS odometer,
           t."eventAt" AS "eventAt",
           t."receivedAt" AS "receivedAt"
    FROM "Bus" b
    JOIN LATERAL (
      SELECT e.payload->>'kilometrosOdometro' AS odometer,
             e."eventAt",
             e."receivedAt"
      FROM "IntegrationInboundEvent" e
      WHERE e."tenantId" = b."tenantId"
        AND e."busCode" = b."code"
        AND e."eventAt" >= now() - interval '3 days'
        AND e.payload->>'kilometrosOdometro' IS NOT NULL
        AND e.payload->>'kilometrosOdometro' <> ''
      ORDER BY e."eventAt" DESC
      LIMIT 1
    ) t ON true
    WHERE b."tenantId" = ${tenantId}
    ORDER BY b."code"
  `);
  return rows;
}

// Cacheado 5 minutos: protege la base de que la consulta corra en cada carga.
export function getLatestOdometer(tenantId: string): Promise<OdometerRow[]> {
  return unstable_cache(
    () => queryLatestOdometer(tenantId),
    ["telemetry-odometer", tenantId],
    { revalidate: 300 }
  )();
}
