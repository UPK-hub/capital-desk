import { prisma } from "@/lib/prisma";

// Diagnóstico de SOLO LECTURA y RÁPIDO: muestrea las 50.000 tramas más recientes
// para ver los campos reales y la calidad (retransmitidas / lecturas duplicadas).
function elide(obj: unknown): unknown {
  if (typeof obj === "string") return obj.length > 80 ? `${obj.slice(0, 80)}… (${obj.length} chars)` : obj;
  if (Array.isArray(obj)) return obj.slice(0, 3).map(elide);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) out[k] = elide(v);
    return out;
  }
  return obj;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true, code: true } });
  if (!tenant) {
    console.log("No hay tenant.");
    return;
  }
  const tenantId = tenant.id;
  console.log("Tenant:", tenant.code, "\n");

  const recent = await prisma.integrationInboundEvent.findMany({
    where: { tenantId },
    orderBy: { receivedAt: "desc" },
    take: 5,
    select: { externalId: true, kind: true, payload: true },
  });
  if (recent.length === 0) {
    console.log("No hay tramas registradas.");
    await prisma.$disconnect();
    return;
  }

  console.log("===== EJEMPLO DE PAYLOAD (más reciente) =====");
  console.log(JSON.stringify(elide(recent[0].payload), null, 2));

  console.log("\n===== RESUMEN CALIDAD (muestra: 50.000 tramas más recientes) =====");
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH muestra AS (
       SELECT "busCode", "tramaType", payload
       FROM "IntegrationInboundEvent"
       WHERE "tenantId" = $1
       ORDER BY "receivedAt" DESC
       LIMIT 50000
     )
     SELECT
       (SELECT count(*)::int FROM muestra) AS total_muestra,
       (SELECT count(*)::int FROM muestra WHERE lower(coalesce(payload->>'tramaRetransmitida','')) = 'true') AS retrans_true,
       (SELECT count(payload->>'idRegistro')::int FROM muestra) AS idreg_total,
       (SELECT count(DISTINCT payload->>'idRegistro')::int FROM muestra) AS idreg_distintos,
       (SELECT count(*)::int FROM (
          SELECT 1 FROM muestra
          WHERE payload->>'fechaHoraLecturaDato' IS NOT NULL
          GROUP BY "busCode", payload->>'fechaHoraLecturaDato', "tramaType"
          HAVING count(*) > 1
       ) d) AS dup_grupos`,
    tenantId
  );
  const r = rows[0] || {};
  console.log("  total en la muestra            :", r.total_muestra);
  console.log("  tramaRetransmitida = true      :", r.retrans_true);
  console.log("  idRegistro total               :", r.idreg_total);
  console.log("  idRegistro distintos           :", r.idreg_distintos, "(si == total => único, se deduplica)");
  console.log("  grupos de lectura duplicada    :", r.dup_grupos, "(mismo bus + fechaLectura + tipo)");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Inspección falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
