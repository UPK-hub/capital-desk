/**
 * Novedades "NVR no reporta al centro de gestión" (48 casos del Excel del 26/06/2026).
 *
 * Para cada caso de la lista (tipo NOVEDAD del tenant):
 *   1) CREADOR  = Daniel Osorio
 *      → Se escribe en el evento CREATED (meta.userId / by / actorUserId) para que
 *        la columna y el filtro "Creador" de /novedades lo reflejen.
 *      → Si el caso no tiene evento CREATED, se crea uno.
 *   2) RESPONSABLE (Asignado) = Anderson Rueda
 *      → Hace lo mismo que el botón "Responsable del caso": Case.assignedToId +
 *        evento ASSIGNED "Responsable del caso: <nombre>".
 *
 * NO cambia el estado del caso. Idempotente (no duplica eventos si ya está bien).
 * DRY-RUN por defecto (no toca nada). Muestra qué cambiaría.
 *
 *   npm run asignar:novedades
 *   npm run asignar:novedades -- --apply
 *   npm run asignar:novedades -- --apply --tenant CAPITALBUS \
 *       --daniel daniel.osorio@upk.local --anderson anderson.rueda@upk.local \
 *       --by gerenciatactica@upkeepservices.com.co
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";

// [caseNo, bus] — 48 casos del Excel (caseNo 2437–2485)
const CASES: Array<[number, string]> = [
  [2437, "K1585"], [2438, "K1585"], [2439, "K1416"], [2440, "K1416"],
  [2441, "K1650"], [2442, "K1650"], [2443, "K1420"], [2444, "K1420"],
  [2445, "K1633"], [2446, "K1633"], [2447, "K1446"], [2448, "K1629"],
  [2449, "K1525"], [2450, "K1617"], [2451, "K1562"], [2452, "K1551"],
  [2453, "K1583"], [2454, "K1521"], [2455, "K1442"], [2456, "K1409"],
  [2457, "K1418"], [2458, "K1454"], [2459, "K1404"], [2460, "K1606"],
  [2461, "K1432"], [2462, "K1405"], [2463, "K1563"], [2464, "K1401"],
  [2465, "K1434"], [2466, "K1534"], [2467, "K1457"], [2468, "K1602"],
  [2469, "K1403"], [2470, "K1408"], [2471, "K1431"], [2472, "K1591"],
  [2473, "K1474"], [2474, "K1402"], [2475, "K1532"], [2476, "K1471"],
  [2477, "K1655"], [2479, "K1401"], [2480, "K1404"], [2481, "K1404"],
  [2482, "K1601"], [2483, "K1509"], [2484, "K1509"], [2485, "K1498"],
];

type Usr = { id: string; name: string; email: string | null };

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

function actorIdOf(meta: any): string | null {
  const id = meta?.userId ?? meta?.by ?? meta?.actorUserId;
  return id ? String(id) : null;
}

async function resolveUser(tenantId: string, email: string | null, tokens: string[]): Promise<Usr | null> {
  if (email) {
    const u = await prisma.user.findFirst({
      where: { tenantId, email: email.toLowerCase() },
      select: { id: true, name: true, email: true },
    });
    if (u) return u;
  }
  for (const t of tokens) {
    const found = await prisma.user.findMany({
      where: { tenantId, name: { contains: t, mode: "insensitive" } },
      select: { id: true, name: true, email: true },
    });
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      console.error(`  ⚠ Nombre ambiguo "${t}": ${found.map((u) => `${u.name} <${u.email}>`).join(" | ")}`);
      return null;
    }
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const byEmail = (arg("--by") || "gerenciatactica@upkeepservices.com.co").toLowerCase();

  console.log(`\n=== Novedades NVR: creador Daniel Osorio + responsable Anderson Rueda ===`);
  console.log(`Modo:   ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant: ${tenantCode}`);
  console.log(`Casos:  ${CASES.length}\n`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error(`✗ No se encontró el tenant "${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const daniel = await resolveUser(tenantId, arg("--daniel"), ["Daniel Osorio", "Osorio"]);
  const anderson = await resolveUser(tenantId, arg("--anderson") || "anderson.rueda@upk.local", ["Anderson Rueda", "Anderson"]);
  const operator = await prisma.user.findFirst({ where: { tenantId, email: byEmail }, select: { id: true, name: true } });

  console.log(`Creador     (Daniel):   ${daniel ? `${daniel.name} <${daniel.email}>` : "✗ NO encontrado"}`);
  console.log(`Responsable (Anderson): ${anderson ? `${anderson.name} <${anderson.email}>` : "✗ NO encontrado"}`);
  console.log(`Operador del registro:  ${operator ? operator.name : `(no se encontró ${byEmail}; se omite "by")`}\n`);

  if ((!daniel || !anderson) && apply) {
    console.error("✗ Faltan usuarios. Usa --daniel <correo> / --anderson <correo>. (Abortado, no se escribió nada.)");
    process.exit(1);
  }

  let creadorFix = 0;
  let creadorNuevo = 0;
  let responsableFix = 0;
  let yaOk = 0;
  const noEncontrados: string[] = [];
  const detalle: string[] = [];

  for (const [caseNo, bus] of CASES) {
    const kase = await prisma.case.findFirst({
      where: { tenantId, caseNo, type: CaseType.NOVEDAD },
      select: {
        id: true,
        assignedToId: true,
        bus: { select: { code: true } },
        events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, meta: true } },
      },
    });
    if (!kase) {
      noEncontrados.push(`#${caseNo} ${bus}`);
      continue;
    }

    const createdEvents = kase.events.filter((e) => e.type === CaseEventType.CREATED);
    const creatorOk = daniel ? createdEvents.some((e) => actorIdOf(e.meta) === daniel.id) && createdEvents.length > 0 : false;
    const needCreator = !!daniel && !creatorOk;
    const needResponsable = !!anderson && kase.assignedToId !== anderson.id;

    if (!needCreator && !needResponsable) {
      yaOk++;
      continue;
    }

    const ops: any[] = [];

    // 1) Creador = Daniel (en el/los eventos CREATED; si no hay, se crea uno)
    if (needCreator && daniel) {
      if (createdEvents.length === 0) {
        ops.push(
          prisma.caseEvent.create({
            data: {
              caseId: kase.id,
              type: CaseEventType.CREATED,
              message: "Caso creado",
              meta: { userId: daniel.id, by: daniel.id, actorUserId: daniel.id, source: "import-creador-novedad" },
            },
          })
        );
        creadorNuevo++;
      } else {
        for (const ev of createdEvents) {
          const m = (ev.meta ?? {}) as any;
          if (actorIdOf(m) === daniel.id) continue;
          ops.push(
            prisma.caseEvent.update({
              where: { id: ev.id },
              data: { meta: { ...m, userId: daniel.id, by: daniel.id, actorUserId: daniel.id } },
            })
          );
        }
        creadorFix++;
      }
    }

    // 2) Responsable = Anderson (igual que el botón "Responsable del caso")
    if (needResponsable && anderson) {
      ops.push(prisma.case.update({ where: { id: kase.id }, data: { assignedToId: anderson.id } }));
      ops.push(
        prisma.caseEvent.create({
          data: {
            caseId: kase.id,
            type: CaseEventType.ASSIGNED,
            message: `Responsable del caso: ${anderson.name}`,
            meta: { assignedToId: anderson.id, by: operator?.id, source: "import-responsable-novedad" },
          },
        })
      );
      responsableFix++;
    }

    if (apply && ops.length) await prisma.$transaction(ops);

    detalle.push(
      `#${caseNo} ${kase.bus?.code ?? bus}` +
        (needCreator ? " · creador→Daniel" : "") +
        (needResponsable ? " · responsable→Anderson" : "")
    );
  }

  console.log(`--- ${apply ? "Cambios aplicados" : "Cambios a aplicar"} (${detalle.length}) ---`);
  for (const d of detalle) console.log("  ✔ " + d);
  if (noEncontrados.length) {
    console.log(`\n--- Caso no encontrado en BD (${noEncontrados.length}) ---`);
    for (const s of noEncontrados) console.log("  • " + s);
  }

  console.log(`\n=== Totales ===`);
  console.log(`  Casos en la lista:        ${CASES.length}`);
  console.log(`  ${apply ? "Creador corregido:" : "Creador a corregir:"}       ${creadorFix}`);
  console.log(`  ${apply ? "Evento CREATED nuevo:" : "Evento CREATED a crear:"}    ${creadorNuevo}`);
  console.log(`  ${apply ? "Responsable asignado:" : "Responsable a asignar:"}    ${responsableFix}`);
  console.log(`  Ya estaban correctos:     ${yaOk}`);
  if (noEncontrados.length) console.log(`  Casos no encontrados:     ${noEncontrados.length}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló el script:", err);
    process.exit(1);
  });
