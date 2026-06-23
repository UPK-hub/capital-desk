import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Calidad de tramas:
//  - Retransmitidas: tramas con la bandera real "tramaRetransmitida" = true.
//  - Duplicadas: misma lectura repetida = mismo bus + misma fechaHoraLecturaDato
//    + mismo tipo de trama en más de una fila (el idRegistro es único por diseño,
//    así que la repetición real se detecta por la lectura, no por el id).

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
  busCode: string;
  lecturaAt: string;
  tramaType: number | null;
  count: number;
  firstReceived: Date | null;
  lastReceived: Date | null;
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
  const retrans = Prisma.sql`lower(coalesce(payload->>'tramaRetransmitida', '')) IN ('true', '1', 't', 'si', 'sí')`;

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
        AND ${retrans}
      ORDER BY "eventAt" DESC NULLS LAST, "receivedAt" DESC
      LIMIT ${limit}
    `),
    prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS c
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${rangeFilter} ${busFilter} AND ${retrans}
    `),
    prisma.$queryRaw<DuplicatedGroup[]>(Prisma.sql`
      SELECT "busCode",
             payload->>'fechaHoraLecturaDato' AS "lecturaAt",
             "tramaType",
             count(*)::int AS "count",
             min("receivedAt") AS "firstReceived",
             max("receivedAt") AS "lastReceived"
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${rangeFilter} ${busFilter}
        AND payload->>'fechaHoraLecturaDato' IS NOT NULL
      GROUP BY "busCode", payload->>'fechaHoraLecturaDato', "tramaType"
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
