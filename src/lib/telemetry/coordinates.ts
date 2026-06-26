import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export type CoordRow = {
  busCode: string;
  plate: string | null;
  total: number; // tramas con GPS hoy
  distintas: number; // coordenadas distintas hoy
  maxRep: number; // veces que se repite la coordenada más frecuente
  topLat: string | null;
  topLon: string | null;
  ceroCount: number; // tramas con coordenada en 0,0
};

const ZEROS = ["0", "0.0", "0.00", "0.000", "0.0000", "0.00000", "0.000000", "0.0000000"];

// Calidad de GPS de HOY por bus. Detecta:
//  - coordenada en 0,0 (sin señal): ceroCount
//  - coordenada repetida / GPS atascado: maxRep alto y/o pocas distintas
// Acotado al día de hoy (zona Bogotá) y CACHEADO para no escanear de más.
async function queryCoordinateQuality(tenantId: string): Promise<CoordRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      busCode: string;
      total: number;
      distintas: number;
      maxRep: number;
      topLat: string | null;
      topLon: string | null;
      ceroCount: number;
    }>
  >(Prisma.sql`
    WITH gps AS (
      SELECT e."busCode",
             trim(e.payload->'localizacionVehiculo'->>'latitud') AS lat,
             trim(e.payload->'localizacionVehiculo'->>'longitud') AS lon
      FROM "IntegrationInboundEvent" e
      WHERE e."tenantId" = ${tenantId}
        AND e."eventAt" >= (date_trunc('day', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota')
        AND e.payload->'localizacionVehiculo'->>'latitud' IS NOT NULL
    ),
    porcoord AS (
      SELECT "busCode", lat, lon, count(*)::int AS c
      FROM gps
      GROUP BY "busCode", lat, lon
    )
    SELECT pc."busCode" AS "busCode",
           sum(pc.c)::int AS total,
           count(*)::int AS distintas,
           max(pc.c)::int AS "maxRep",
           (array_agg(pc.lat ORDER BY pc.c DESC))[1] AS "topLat",
           (array_agg(pc.lon ORDER BY pc.c DESC))[1] AS "topLon",
           coalesce(sum(pc.c) FILTER (
             WHERE pc.lat IN (${Prisma.join(ZEROS)}) AND pc.lon IN (${Prisma.join(ZEROS)})
           ), 0)::int AS "ceroCount"
    FROM porcoord pc
    GROUP BY pc."busCode"
    ORDER BY pc."busCode"
  `);
  if (rows.length === 0) return [];
  const codes = Array.from(new Set(rows.map((r) => r.busCode)));
  const buses = await prisma.bus.findMany({
    where: { tenantId, code: { in: codes } },
    select: { code: true, plate: true },
  });
  const plateByCode = new Map(buses.map((b) => [b.code, b.plate]));
  return rows.map((r) => ({ ...r, plate: plateByCode.get(r.busCode) ?? null }));
}

// Cacheado 10 minutos (la calidad de GPS no cambia segundo a segundo).
export function getCoordinateQuality(tenantId: string): Promise<CoordRow[]> {
  return unstable_cache(
    () => queryCoordinateQuality(tenantId),
    ["telemetry-coordinates", tenantId],
    { revalidate: 600 }
  )();
}
