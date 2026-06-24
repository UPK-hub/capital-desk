/**
 * Asigna el "Responsable del caso" (técnico) a los 58 casos PREVENTIVO de junio
 * 2026, según el Excel (columna "Asignado"). Hace lo MISMO que el botón
 * "Responsable del caso" de la web (PATCH /api/cases/[id] con assignedToId):
 *   1) Case.assignedToId = técnico
 *   2) Registra un CaseEvent (ASSIGNED) "Responsable del caso: <nombre>"
 *   3) Si el caso tiene OT, también pone WorkOrder.assignedToId = técnico
 * NO cambia el estado del caso (sigue Resuelto).
 *
 * Mapeo de nombres del Excel -> usuario real del sistema:
 *   King Anderson -> Anderson Rueda  (anderson.rueda@upk.local)
 *   Diego         -> Diego Hernández (diego.hernandez@upk.local)
 *   Leonardo      -> Leonardo Corredor (por nombre)
 *
 * Idempotente: si ya está asignado al mismo técnico, no hace nada (no duplica eventos).
 * DRY-RUN por defecto (no toca nada). Muestra a qué usuario resuelve cada nombre.
 *   npm run asignar:responsable
 *   npm run asignar:responsable -- --apply
 *   npm run asignar:responsable -- --apply --tenant CAPITALBUS --by gerenciatactica@upkeepservices.com.co
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType } from "@prisma/client";

// Nombre en el Excel -> cómo encontrar al usuario (email primero; si no, por nombre)
const TECH_MAP: Record<string, { email?: string; tokens: string[] }> = {
  "King Anderson": { email: "anderson.rueda@upk.local", tokens: ["Anderson Rueda", "Anderson"] },
  Diego: { email: "diego.hernandez@upk.local", tokens: ["Diego Hernández", "Diego Hernandez", "Diego"] },
  Leonardo: { tokens: ["Leonardo Corredor", "Corredor", "Leonardo"] },
};

// [caseNo, bus, tecnico(Excel)] — 58 casos
const ASSIGN: Array<[number, string, string]> = [
  [2379, "K1407", "King Anderson"],
  [2380, "K1410", "Diego"],
  [2381, "K1417", "Leonardo"],
  [2382, "K1422", "King Anderson"],
  [2383, "K1423", "King Anderson"],
  [2384, "K1426", "King Anderson"],
  [2385, "K1428", "King Anderson"],
  [2386, "K1430", "Leonardo"],
  [2387, "K1431", "Leonardo"],
  [2388, "K1434", "Leonardo"],
  [2389, "K1438", "Leonardo"],
  [2390, "K1439", "King Anderson"],
  [2391, "K1441", "King Anderson"],
  [2392, "K1452", "King Anderson"],
  [2393, "K1463", "King Anderson"],
  [2394, "K1474", "Diego"],
  [2395, "K1482", "King Anderson"],
  [2396, "K1487", "Diego"],
  [2397, "K1488", "Leonardo"],
  [2398, "K1490", "Leonardo"],
  [2399, "K1492", "King Anderson"],
  [2400, "K1498", "King Anderson"],
  [2401, "K1502", "Leonardo"],
  [2402, "K1509", "King Anderson"],
  [2403, "K1511", "Leonardo"],
  [2404, "K1515", "Diego"],
  [2405, "K1520", "Diego"],
  [2406, "K1527", "King Anderson"],
  [2407, "K1530", "King Anderson"],
  [2408, "K1533", "King Anderson"],
  [2409, "K1536", "King Anderson"],
  [2410, "K1544", "King Anderson"],
  [2411, "K1546", "King Anderson"],
  [2412, "K1558", "Diego"],
  [2413, "K1564", "Leonardo"],
  [2414, "K1567", "Diego"],
  [2415, "K1569", "King Anderson"],
  [2416, "K1577", "Leonardo"],
  [2417, "K1582", "King Anderson"],
  [2418, "K1584", "King Anderson"],
  [2419, "K1604", "Diego"],
  [2420, "K1607", "King Anderson"],
  [2421, "K1611", "King Anderson"],
  [2422, "K1616", "Diego"],
  [2423, "K1619", "Leonardo"],
  [2424, "K1623", "Diego"],
  [2425, "K1625", "Leonardo"],
  [2426, "K1626", "Diego"],
  [2427, "K1627", "Diego"],
  [2428, "K1628", "Leonardo"],
  [2429, "K1630", "King Anderson"],
  [2430, "K1631", "King Anderson"],
  [2431, "K1634", "King Anderson"],
  [2432, "K1638", "Leonardo"],
  [2433, "K1646", "King Anderson"],
  [2434, "K1647", "Diego"],
  [2435, "K1649", "King Anderson"],
  [2436, "K1657", "King Anderson"],
];

type Usr = { id: string; name: string; email: string; role: string; active: boolean };

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function resolveTech(tenantId: string, label: string): Promise<{ user?: Usr; error?: string }> {
  const cfg = TECH_MAP[label];
  if (!cfg) return { error: `No hay mapeo para "${label}"` };

  // 1) por correo (lo más confiable)
  if (cfg.email) {
    const u = (await prisma.user.findFirst({
      where: { tenantId, email: cfg.email.toLowerCase() },
      select: { id: true, name: true, email: true, role: true, active: true },
    })) as Usr | null;
    if (u) return { user: u };
  }

  // 2) por nombre (token más específico primero)
  for (const token of cfg.tokens) {
    const found = (await prisma.user.findMany({
      where: { tenantId, name: { contains: token, mode: "insensitive" } },
      select: { id: true, name: true, email: true, role: true, active: true },
    })) as Usr[];
    if (found.length === 1) return { user: found[0] };
    if (found.length > 1) {
      return { error: `Ambiguo "${label}" (token "${token}"): ${found.map((u) => `${u.name} <${u.email}>`).join(" | ")}` };
    }
  }
  return { error: `No se encontró usuario para "${label}" (${cfg.email ?? cfg.tokens.join("/")})` };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const byEmail = (arg("--by") || "gerenciatactica@upkeepservices.com.co").toLowerCase();

  console.log(`\n=== Asignar responsable a casos PREVENTIVO (junio 2026) ===`);
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

  // Operador para el registro del evento (quién hizo la asignación)
  const operator = await prisma.user.findFirst({ where: { tenantId, email: byEmail }, select: { id: true, name: true } });
  const operatorId = operator?.id;
  console.log(`Operador del registro: ${operator ? `${operator.name}` : `(no se encontró ${byEmail}; se omite "by")`}\n`);

  // Resolver los nombres del Excel a usuarios reales
  console.log(`--- Resolución de nombres ---`);
  const resolved = new Map<string, Usr>();
  let resolveError = false;
  for (const label of Object.keys(TECH_MAP)) {
    const { user, error } = await resolveTech(tenantId, label);
    if (user) {
      const inactive = user.active ? "" : "  ⚠ INACTIVO";
      console.log(`  "${label}"  ->  ${user.name} <${user.email}> [${user.role}]${inactive}`);
      resolved.set(label, user);
      if (!user.active) resolveError = true;
    } else {
      console.log(`  "${label}"  ->  ✗ ${error}`);
      resolveError = true;
    }
  }
  console.log("");

  if (resolveError && apply) {
    console.error("✗ Hay nombres sin resolver o usuarios inactivos. Corrige antes de --apply. (Abortado, no se escribió nada.)");
    process.exit(1);
  }

  // Recorrer casos
  let yaOk = 0;
  let asignados = 0;
  let woActualizadas = 0;
  const noEncontrados: string[] = [];
  const sinUsuario: string[] = [];
  const detalle: string[] = [];

  for (const [caseNo, bus, label] of ASSIGN) {
    const u = resolved.get(label);
    if (!u) {
      sinUsuario.push(`#${caseNo} ${bus} (${label})`);
      continue;
    }
    const kase = await prisma.case.findFirst({
      where: { tenantId, caseNo },
      select: { id: true, assignedToId: true, bus: { select: { code: true } }, workOrder: { select: { id: true, assignedToId: true } } },
    });
    if (!kase) {
      noEncontrados.push(`#${caseNo} ${bus}`);
      continue;
    }

    const needCase = kase.assignedToId !== u.id;
    const needWo = !!kase.workOrder && kase.workOrder.assignedToId !== u.id;

    if (!needCase && !needWo) {
      yaOk++;
      continue;
    }

    if (apply) {
      const ops: any[] = [];
      if (needCase) {
        ops.push(prisma.case.update({ where: { id: kase.id }, data: { assignedToId: u.id } }));
        ops.push(
          prisma.caseEvent.create({
            data: {
              caseId: kase.id,
              type: CaseEventType.ASSIGNED,
              message: `Responsable del caso: ${u.name}`,
              meta: { assignedToId: u.id, by: operatorId, source: "import-asignacion-preventivo" },
            },
          })
        );
      }
      if (needWo && kase.workOrder) {
        ops.push(prisma.workOrder.update({ where: { id: kase.workOrder.id }, data: { assignedToId: u.id } }));
      }
      await prisma.$transaction(ops);
    }

    if (needCase) asignados++;
    if (needWo) woActualizadas++;
    detalle.push(`#${caseNo} ${bus} -> ${u.name}${needWo ? " (+OT)" : ""}`);
  }

  console.log(`--- ${apply ? "Asignados" : "Se asignarían"} (${detalle.length}) ---`);
  for (const d of detalle) console.log("  ✔ " + d);
  if (noEncontrados.length) {
    console.log(`\n--- Caso no encontrado en BD (${noEncontrados.length}) ---`);
    for (const s of noEncontrados) console.log("  • " + s);
  }
  if (sinUsuario.length) {
    console.log(`\n--- Sin usuario resuelto (${sinUsuario.length}) ---`);
    for (const s of sinUsuario) console.log("  • " + s);
  }

  console.log(`\n=== Totales ===`);
  console.log(`  Casos en la lista:        ${ASSIGN.length}`);
  console.log(`  ${apply ? "Responsable asignado:" : "Responsable a asignar:"}    ${asignados}`);
  console.log(`  OT actualizadas:          ${woActualizadas}`);
  console.log(`  Ya estaban correctos:     ${yaOk}`);
  if (noEncontrados.length) console.log(`  Casos no encontrados:     ${noEncontrados.length}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló la asignación:", err);
    process.exit(1);
  });
