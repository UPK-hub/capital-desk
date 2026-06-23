import { prisma } from "@/lib/prisma";

// Diagnóstico de SOLO LECTURA: muestra los nombres/valores reales de los campos
// de la trama cruda, para configurar bien "retransmitidas" y "duplicadas".
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
    select: { externalId: true, kind: true, tramaType: true, payload: true },
  });

  if (recent.length === 0) {
    console.log("No hay tramas registradas.");
    await prisma.$disconnect();
    return;
  }

  console.log("===== EJEMPLO DE PAYLOAD (más reciente, valores largos recortados) =====");
  console.log(JSON.stringify(elide(recent[0].payload), null, 2));

  const keyset = new Set<string>();
  recent.forEach((r) => {
    if (r.payload && typeof r.payload === "object") Object.keys(r.payload as any).forEach((k) => keyset.add(k));
  });
  console.log("\n===== CLAVES DE PAYLOAD (muestra de 5) =====");
  console.log(Array.from(keyset).sort().join(", "));

  console.log("\n===== CAMPOS CANDIDATOS (retransmi/registr/reenvi/duplicad) =====");
  recent.forEach((r, i) => {
    const p = (r.payload || {}) as any;
    const cand: any = {};
    for (const k of Object.keys(p)) {
      if (/retransmi|reenvi|registr|duplicad|consecut/i.test(k)) cand[k] = p[k];
    }
    console.log(`fila ${i} (${r.kind}): ${JSON.stringify(cand)}`);
  });

  console.log("\n===== ¿EXISTEN CAMPOS DE RETRANSMISIÓN? =====");
  const names = [
    "retransmision",
    "retransmisión",
    "retransmitido",
    "retransmitida",
    "esRetransmision",
    "reenvio",
    "reEnvio",
    "tramaRetransmitida",
    "indicadorRetransmision",
  ];
  for (const n of names) {
    const c = await prisma.$queryRawUnsafe<any[]>(
      `SELECT count(*)::int AS c FROM "IntegrationInboundEvent" WHERE "tenantId" = $1 AND payload->>'${n}' IS NOT NULL`,
      tenantId
    );
    const cnt = Number(c[0]?.c ?? 0);
    if (cnt > 0) {
      const sample = await prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT payload->>'${n}' AS v FROM "IntegrationInboundEvent" WHERE "tenantId" = $1 AND payload->>'${n}' IS NOT NULL LIMIT 6`,
        tenantId
      );
      console.log(`  '${n}': ${cnt} filas · valores: ${JSON.stringify(sample.map((s) => s.v))}`);
    }
  }

  console.log("\n===== ¿HAY DUPLICADOS POR idRegistro? =====");
  const dup = await prisma.$queryRawUnsafe<any[]>(
    `SELECT payload->>'idRegistro' AS rid, count(*)::int AS c FROM "IntegrationInboundEvent" WHERE "tenantId" = $1 AND payload->>'idRegistro' IS NOT NULL GROUP BY 1 HAVING count(*) > 1 ORDER BY c DESC LIMIT 5`,
    tenantId
  );
  console.log("  duplicados idRegistro (top 5):", JSON.stringify(dup));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Inspección falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
