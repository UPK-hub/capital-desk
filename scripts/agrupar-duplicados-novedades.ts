/**
 * Agrupa las NOVEDADES que son "el mismo caso reportado varias veces":
 * mismo bus + misma novedad (equipo afectado + novedad reportada / título).
 *
 * No cambia el esquema. Marca el grupo con un evento por caso:
 *   CaseEvent.meta = { duplicateAction: "link", duplicateGroupId, auto: true }
 *
 * El id de grupo es determinista (DUP-<BUS>-<clave>), así que volver a correr
 * el script NO crea grupos nuevos ni duplica eventos (idempotente).
 *
 * DRY-RUN por defecto (no escribe nada). Muestra los grupos que formaría.
 *   npm run novedades:agrupar
 *   npm run novedades:agrupar -- --apply
 *   npm run novedades:agrupar -- --apply --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";
import { deterministicGroupId, issueKeyForCase, resolveDuplicateGroupId } from "@/lib/novedades/duplicates";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";

  console.log(`\n=== Agrupar novedades duplicadas (mismo bus + misma novedad) ===`);
  console.log(`Modo:   ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant: ${tenantCode}\n`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error(`✗ No se encontró el tenant "${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const novedades = await prisma.case.findMany({
    where: { tenantId, type: CaseType.NOVEDAD },
    orderBy: { caseNo: "asc" },
    select: {
      id: true,
      caseNo: true,
      title: true,
      bus: { select: { code: true } },
      events: { orderBy: { createdAt: "asc" }, select: { createdAt: true, meta: true } },
    },
  });

  // Agrupar por id de grupo determinista
  type Item = { id: string; caseNo: number | null; busCode: string; currentGroup: string | null };
  const groups = new Map<string, Item[]>();
  for (const n of novedades) {
    const busCode = n.bus?.code ?? "SIN-BUS";
    const gid = deterministicGroupId(busCode, issueKeyForCase({ title: n.title, events: n.events }));
    const item: Item = { id: n.id, caseNo: n.caseNo, busCode, currentGroup: resolveDuplicateGroupId(n.events) };
    const arr = groups.get(gid) ?? [];
    arr.push(item);
    groups.set(gid, arr);
  }

  let gruposConDuplicados = 0;
  let eventosACrear = 0;
  let yaEnlazados = 0;
  const ops: any[] = [];

  for (const [gid, items] of groups) {
    if (items.length < 2) continue; // no es duplicado
    gruposConDuplicados++;
    const nums = items.map((i) => `#${i.caseNo}`).join(", ");
    console.log(`• ${items[0].busCode}  (${items.length})  ${gid}\n    ${nums}`);
    for (const it of items) {
      if (it.currentGroup === gid) {
        yaEnlazados++;
        continue;
      }
      eventosACrear++;
      ops.push(
        prisma.caseEvent.create({
          data: {
            caseId: it.id,
            type: CaseEventType.COMMENT,
            message: "Novedad marcada como el mismo caso (duplicada).",
            meta: { duplicateAction: "link", duplicateGroupId: gid, auto: true },
          },
        })
      );
    }
  }

  if (apply && ops.length) {
    // En lotes para no saturar
    for (let i = 0; i < ops.length; i += 50) {
      await prisma.$transaction(ops.slice(i, i + 50));
    }
  }

  console.log(`\n=== Totales ===`);
  console.log(`  Novedades revisadas:        ${novedades.length}`);
  console.log(`  Grupos con duplicados:      ${gruposConDuplicados}`);
  console.log(`  ${apply ? "Novedades enlazadas:" : "Novedades a enlazar:"}        ${eventosACrear}`);
  console.log(`  Ya estaban enlazadas:       ${yaEnlazados}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló el agrupado:", err);
    process.exit(1);
  });
