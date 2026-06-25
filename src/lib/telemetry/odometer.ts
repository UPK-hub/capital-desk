import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OdometerRow = {
  busCode: string;
  plate: string | null;
  odometer: string | null;
  eventAt: Date | null;
  receivedAt: Date | null;
};

// Último kilometraje (campo kilometrosOdometro) reportado por cada bus.
// El dato llega dentro del payload de las tramas P60 (periódicas extendidas) y
// ya se guarda tal cual; aquí solo se lee. Por cada bus se busca la trama más
// reciente que traiga el campo, usando el índice (tenantId, busCode, eventAt)
// vía JOIN LATERAL. Solo aparecen los buses que tienen al menos una lectura.
export async function getLatestOdometer(tenantId: string): Promise<OdometerRow[]> {
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
        AND e."receivedAt" >= now() - interval '30 days'
        AND e.payload->>'kilometrosOdometro' IS NOT NULL
        AND e.payload->>'kilometrosOdometro' <> ''
      ORDER BY e."eventAt" DESC NULLS LAST, e."receivedAt" DESC
      LIMIT 1
    ) t ON true
    WHERE b."tenantId" = ${tenantId}
    ORDER BY b."code"
  `);
  return rows;
}
