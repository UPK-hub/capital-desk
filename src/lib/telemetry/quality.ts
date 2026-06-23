import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Calidad de tramas leída de la tabla principal (ya no se deduplica al recibir):
//  - Retransmitidas: columna retransmitida = true (de tramaRetransmitida).
//  - Duplicadas: mismo externalId (idRegistro) guardado en más de una fila.

export type RetransmittedRow = {
  id: string;
  busCode: string;
  idRegistro: string | null;
  tramaType: number | null;
  kind: string | null;
  lecturaAt: string | null;
  eventAt: Date | null;
  receivedAt: Date;
};

export type DuplicatedGroup = {
  idRegistro: string | null;
  busCode: string;
  count: number;
  firstReceived: Date | null;
  lastReceived: Date | null;
};

export type TramaQuality = {
  range: { start: Date; end: Date };
  busCode: string | null;
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
  busCode?: string | null;
  limit?: number;
}): Promise<TramaQuality> {
  const { tenantId, start, end } = params;
  const busCode = params.busCode ?? null;
  const limit = Math.min(Math.max(params.limit ?? 1000, 1), 10000);

  const busFilter = busCode ? Prisma.sql`AND "busCode" = ${busCode}` : Prisma.empty;
  const rangeFilter = Prisma.sql`AND (("eventAt" >= ${start} AND "eventAt" <= ${end}) OR ("eventAt" IS NULL AND "receivedAt" >= ${start} AND "receivedAt" <= ${end}))`;

  const [retransmitted, retransCount, duplicated] = await Promise.all([
    prisma.$queryRaw<RetransmittedRow[]>(Prisma.sql`
      SELECT "id", "busCode",
             "externalId" AS "idRegistro",
             "tramaType", "kind"::text AS "kind",
             payload->>'fechaHoraLecturaDato' AS "lecturaAt",
             "eventAt", "receivedAt"
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} AND "retransmitida" = true ${rangeFilter} ${busFilter}
      ORDER BY "eventAt" DESC NULLS LAST, "receivedAt" DESC
      LIMIT ${limit}
    `),
    prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS c
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} AND "retransmitida" = true ${rangeFilter} ${busFilter}
    `),
    prisma.$queryRaw<DuplicatedGroup[]>(Prisma.sql`
      SELECT "externalId" AS "idRegistro", "busCode",
             count(*)::int AS "count",
             min("receivedAt") AS "firstReceived",
             max("receivedAt") AS "lastReceived"
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${rangeFilter} ${busFilter}
      GROUP BY "externalId", "busCode"
      HAVING count(*) > 1
      ORDER BY count(*) DESC
      LIMIT ${limit}
    `),
  ]);

  const retransmittedTotal = Number(retransCount[0]?.c ?? 0);
  const duplicatedExtraRows = duplicated.reduce((a, b) => a + (Number(b.count) - 1), 0);

  return {
    range: { start, end },
    busCode,
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
