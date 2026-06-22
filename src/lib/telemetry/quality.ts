import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Calidad de tramas:
//  - Retransmitidas: tramas con bandera de retransmisión = verdadero en el payload.
//  - Duplicadas: tramas que comparten el mismo idRegistro (registro id) en más de una fila.
// Los campos viven en el payload crudo de ETB (payload->>'idRegistro', payload->>'retransmision').

export type RetransmittedRow = {
  id: string;
  busCode: string;
  idRegistro: string | null;
  tramaType: number | null;
  kind: string;
  eventAt: Date | null;
  receivedAt: Date;
};

export type DuplicatedGroup = {
  idRegistro: string;
  count: number;
  busCode: string | null;
  firstAt: Date | null;
  lastAt: Date | null;
};

export type TramaQuality = {
  range: { start: Date; end: Date };
  busId: string | null;
  retransmitted: RetransmittedRow[];
  duplicated: DuplicatedGroup[];
  counts: {
    retransmittedTotal: number;
    duplicatedGroups: number;
    duplicatedExtraRows: number;
  };
  limit: number;
};

export async function buildTramaQuality(params: {
  tenantId: string;
  start: Date;
  end: Date;
  busId?: string | null;
  limit?: number;
}): Promise<TramaQuality> {
  const { tenantId, start, end } = params;
  const busId = params.busId ?? null;
  const limit = Math.min(Math.max(params.limit ?? 1000, 1), 10000);

  const busFilter = busId ? Prisma.sql`AND "busId" = ${busId}` : Prisma.empty;
  const rangeFilter = Prisma.sql`AND (("eventAt" >= ${start} AND "eventAt" <= ${end}) OR ("eventAt" IS NULL AND "receivedAt" >= ${start} AND "receivedAt" <= ${end}))`;
  // Bandera de retransmisión tolerante a variantes de nombre/idioma.
  const retransExpr = Prisma.sql`lower(coalesce(payload->>'retransmision', payload->>'retransmisión', payload->>'retransmitido', payload->>'esRetransmision', payload->>'reenvio', ''))`;
  const truthy = Prisma.sql`('true','1','si','sí','t','yes','y')`;

  const [retransmitted, retransCount, duplicated] = await Promise.all([
    prisma.$queryRaw<RetransmittedRow[]>(Prisma.sql`
      SELECT "id", "busCode",
             payload->>'idRegistro' AS "idRegistro",
             "tramaType", "kind"::text AS "kind",
             "eventAt", "receivedAt"
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId}
        ${rangeFilter}
        ${busFilter}
        AND ${retransExpr} IN ${truthy}
      ORDER BY "eventAt" DESC NULLS LAST, "receivedAt" DESC
      LIMIT ${limit}
    `),
    prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS c
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${rangeFilter} ${busFilter}
        AND ${retransExpr} IN ${truthy}
    `),
    prisma.$queryRaw<DuplicatedGroup[]>(Prisma.sql`
      SELECT payload->>'idRegistro' AS "idRegistro",
             count(*)::int AS "count",
             min("busCode") AS "busCode",
             min("eventAt") AS "firstAt",
             max("eventAt") AS "lastAt"
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${rangeFilter} ${busFilter}
        AND payload->>'idRegistro' IS NOT NULL
      GROUP BY payload->>'idRegistro'
      HAVING count(*) > 1
      ORDER BY count(*) DESC
      LIMIT ${limit}
    `),
  ]);

  const retransmittedTotal = Number(retransCount[0]?.c ?? 0);
  const duplicatedExtraRows = duplicated.reduce((a, b) => a + (Number(b.count) - 1), 0);

  return {
    range: { start, end },
    busId,
    retransmitted,
    duplicated,
    counts: {
      retransmittedTotal,
      duplicatedGroups: duplicated.length,
      duplicatedExtraRows,
    },
    limit,
  };
}
