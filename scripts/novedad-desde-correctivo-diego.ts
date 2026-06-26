/**
 * Migra los 46 CORRECTIVOS creados por Diego (que en realidad eran NOVEDADES de
 * CCTV) a su novedad de origen, clasificando CADA UNO contra el catálogo.
 *
 * Por cada correctivo de la lista:
 *   1) Crea una NOVEDAD de origen cuyo CREADOR es el mismo Diego (se toma del
 *      evento de creación original del correctivo, antes de reasignarlo).
 *   2) Reasigna el creador del CORRECTIVO a Anderson Rueda (metadato del evento
 *      de creación). El correctivo conserva tipo, OT, estado e información.
 *   3) Enlaza el correctivo a la novedad (CaseEvent meta.sourceCaseId), igual que
 *      el botón "Atar a novedad".
 *
 * Clasificación por caso (decidida con Valeria contra el catálogo):
 *   - "No permite comunicación remota / no accede al video streaming" → NVD-207 (NVR)
 *   - "Cámara mal direccionada"                                       → NVD-313 (Cámaras)
 *   - "Ausencia de etiqueta que indique coordenadas"                  → NVD-522 (NVR)  [código nuevo]
 *   - "Domo sucio"                                                    → NVD-315 (Cámaras)
 *   - "Solicita credenciales de acceso al video streaming"           → NVD-500 (CMS)
 *
 * Una novedad por CADA correctivo (46), aunque haya buses repetidos.
 * Idempotente: si el correctivo ya está enlazado a una novedad, se omite.
 * DRY-RUN por defecto (no escribe nada).
 *   npm run novedad:diego
 *   npm run novedad:diego -- --apply
 *   npm run novedad:diego -- --apply --tenant CAPITALBUS
 *   npm run novedad:diego -- --by diego.correo@dominio   (forzar creador de novedades)
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";
import { nextNumbers } from "@/lib/tenant-sequence";

type GroupKey = "A" | "DIR" | "ETIQ" | "DOMO" | "CRED";

const GROUPS: Record<GroupKey, { code: string; equipment: string; novelty: string }> = {
  A:    { code: "NVD-207", equipment: "NVR",     novelty: "No permite comunicación remota para acceder al video streaming" },
  DIR:  { code: "NVD-313", equipment: "CAMARAS", novelty: "Cámara mal direccionada" },
  ETIQ: { code: "NVD-522", equipment: "NVR",     novelty: "Ausencia de etiqueta que indique coordenadas" },
  DOMO: { code: "NVD-315", equipment: "CAMARAS", novelty: "Domo sucio" },
  CRED: { code: "NVD-500", equipment: "CMS",     novelty: "Solicita credenciales de acceso al video streaming" },
};

// Clasificación por número de caso (46 correctivos de Diego).
const CASE_CLASIF: Record<number, GroupKey> = {
  1540: "A", 1541: "A", 1542: "A", 1543: "A", 1544: "A", 1545: "A", 1546: "A",
  1555: "ETIQ",
  1579: "A",
  1580: "DOMO",
  1581: "A",
  1582: "ETIQ",
  1648: "DIR", 1649: "DIR", 1650: "DIR",
  1651: "A", 1652: "A", 1653: "A", 1654: "A", 1655: "A", 1656: "A", 1657: "A",
  1660: "ETIQ",
  1665: "A", 1666: "A",
  1695: "A", 1697: "A",
  1759: "DIR",
  1760: "A", 1761: "A", 1762: "A", 1763: "A", 1764: "A",
  1790: "A", 1791: "A", 1792: "A", 1793: "A", 1794: "A", 1795: "A",
  1796: "CRED",
  1797: "A", 1798: "A", 1799: "A", 1800: "A", 1801: "A", 1802: "A",
};

const CASE_NOS = Object.keys(CASE_CLASIF).map(Number).sort((a, b) => a - b);

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

function originalCreatorId(meta: unknown): string | null {
  const m = (meta ?? {}) as any;
  const id = m?.userId ?? m?.by ?? m?.actorUserId;
  return id && String(id).trim() ? String(id).trim() : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const forcedByEmail = (arg("--by") || "").toLowerCase(); // opcional: forzar creador de las novedades (Diego)

  console.log(`\n=== Migrar 46 correctivos de Diego → novedades (clasificadas) ===`);
  console.log(`Modo:   ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant: ${tenantCode}`);
  console.log(`Casos:  ${CASE_NOS.length}\n`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error(`✗ No se encontró el tenant "${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  // Creador a reasignar a los CORRECTIVOS = Anderson Rueda.
  let anderson = await prisma.user.findFirst({
    where: { tenantId, email: "anderson.rueda@upk.local" },
    select: { id: true, name: true, email: true },
  });
  if (!anderson) {
    anderson = await prisma.user.findFirst({
      where: { tenantId, name: { contains: "Anderson", mode: "insensitive" } },
      select: { id: true, name: true, email: true },
    });
  }
  console.log(`Correctivos → se reasignan a: ${anderson ? `${anderson.name} <${anderson.email}>` : "✗ NO encontrado (Anderson Rueda)"}`);
  if (!anderson && apply) {
    console.error("✗ No se encontró a Anderson Rueda para reasignar los correctivos. (Abortado.)");
    process.exit(1);
  }
  const andersonId = anderson?.id ?? null;

  // Opcional: creador de novedades forzado por correo (si Diego no está en el evento).
  let forcedCreator = forcedByEmail
    ? await prisma.user.findFirst({ where: { tenantId, email: forcedByEmail }, select: { id: true, name: true, email: true } })
    : null;
  if (forcedByEmail && !forcedCreator) console.log(`(Aviso: --by ${forcedByEmail} no coincide con ningún usuario.)`);
  if (forcedCreator) console.log(`Novedades → creador forzado: ${forcedCreator.name} <${forcedCreator.email}>`);

  const cases = await prisma.case.findMany({
    where: { tenantId, caseNo: { in: CASE_NOS } },
    orderBy: { caseNo: "asc" },
    include: {
      bus: { select: { code: true, plate: true } },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, meta: true } },
    },
  });
  const byNo = new Map(cases.map((c) => [c.caseNo, c]));

  // Resolver nombres de los creadores originales (para que confirmes que son Diego).
  const creatorIds = new Set<string>();
  for (const c of cases) {
    for (const ev of c.events.filter((e) => e.type === CaseEventType.CREATED)) {
      const id = originalCreatorId(ev.meta);
      if (id) creatorIds.add(id);
    }
  }
  const creatorUsers = await prisma.user.findMany({
    where: { tenantId, id: { in: Array.from(creatorIds) } },
    select: { id: true, name: true, email: true },
  });
  const creatorById = new Map(creatorUsers.map((u) => [u.id, u]));
  console.log(`\nCreadores originales detectados en estos casos:`);
  for (const u of creatorUsers) console.log(`  • ${u.name} <${u.email}>`);
  console.log("");

  const detalle: string[] = [];
  const omitidos: string[] = [];
  const faltantes: string[] = [];
  let creadas = 0;
  let reasignados = 0;
  let yaEnlazados = 0;

  for (const caseNo of CASE_NOS) {
    const grp = GROUPS[CASE_CLASIF[caseNo]];
    const corr = byNo.get(caseNo);

    if (!corr) { faltantes.push(`#${caseNo} (no existe)`); continue; }
    if (corr.type !== CaseType.CORRECTIVO) {
      omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (no es correctivo: ${corr.type})`);
      continue;
    }

    const createdEvents = corr.events.filter((e) => e.type === CaseEventType.CREATED);
    const alreadyLinked = corr.events.some((e) => Boolean(((e.meta ?? {}) as any)?.sourceCaseId));

    // Creador de la NOVEDAD = Diego (creador original del correctivo, leído ANTES de reasignar).
    const diegoId =
      forcedCreator?.id ??
      createdEvents.map((e) => originalCreatorId(e.meta)).find((id) => id && id !== andersonId) ??
      createdEvents.map((e) => originalCreatorId(e.meta)).find(Boolean) ??
      null;
    const diegoName = diegoId ? (creatorById.get(diegoId)?.name ?? forcedCreator?.name ?? diegoId) : "(desconocido)";

    if (alreadyLinked) {
      yaEnlazados++;
      omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (ya enlazado a una novedad)`);
      continue;
    }
    if (!diegoId) {
      omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (no se pudo identificar al creador/Diego; usa --by <correo>)`);
      continue;
    }

    if (apply) {
      await prisma.$transaction(async (tx) => {
        const { caseNo: novNo } = await nextNumbers(tx, tenantId, { case: true });
        const novedadCaseNo = novNo as number;
        const batchRef = `NVD-${String(novedadCaseNo).padStart(4, "0")}`;

        const novedad = await tx.case.create({
          data: {
            tenantId,
            caseNo: novedadCaseNo,
            busId: corr.busId,
            busEquipmentId: corr.busEquipmentId ?? null,
            type: CaseType.NOVEDAD,
            status: corr.status,
            priority: corr.priority,
            title: `Novedad ${corr.bus?.code ?? ""} - ${grp.novelty}`.trim(),
            description: [
              `Código novedad: ${grp.code}`,
              `Equipo afectado: ${grp.equipment}`,
              `Novedad reportada: ${grp.novelty}`,
              `Referencia original (correctivo #${corr.caseNo}): ${corr.title}`,
            ].join("\n"),
            createdAt: corr.createdAt,
          },
        });

        // Clasificación (la bandeja de Novedades la lee de noveltyState).
        await tx.caseEvent.create({
          data: {
            caseId: novedad.id,
            type: CaseEventType.CREATED,
            message: "Caso creado (novedad de origen, migración Diego)",
            createdAt: corr.createdAt,
            meta: {
              userId: diegoId, // creador = Diego
              migrated: true,
              migrationBatch: "diego-cctv-2026-06",
              originalCorrectivoNo: corr.caseNo,
              noveltyState: {
                batchRef,
                catalogCode: grp.code,
                affectedEquipment: grp.equipment,
                reportedNovelty: grp.novelty,
                observations: corr.title,
              },
            },
          },
        });

        // Alinear updatedAt/cierre con el del correctivo.
        await tx.$executeRaw`UPDATE "Case" SET "updatedAt" = ${corr.updatedAt} WHERE "id" = ${novedad.id}`;

        // Reasignar el creador del CORRECTIVO a Anderson (sobrescribe llaves de actor).
        if (andersonId) {
          for (const ev of createdEvents) {
            const m = (ev.meta ?? {}) as any;
            await tx.caseEvent.update({
              where: { id: ev.id },
              data: {
                meta: {
                  ...m,
                  userId: andersonId,
                  by: andersonId,
                  actorUserId: andersonId,
                  creatorReassigned: true,
                  originalCreatorId: diegoId,
                },
              },
            });
          }
        }

        // Enlace en el correctivo (no cambia su tipo/OT).
        await tx.caseEvent.create({
          data: {
            caseId: corr.id,
            type: CaseEventType.COMMENT,
            message: `Atado a novedad #${novedadCaseNo}`,
            meta: {
              sourceCaseId: novedad.id,
              sourceCaseNo: novedadCaseNo,
              batchRef,
              migrated: true,
              migrationBatch: "diego-cctv-2026-06",
            },
          },
        });
      });
    }

    creadas++;
    if (andersonId) reasignados++;
    detalle.push(
      `#${corr.caseNo} ${corr.bus?.code ?? ""} [${corr.status}] ${grp.code}/${grp.equipment} · "${grp.novelty}" · creador novedad=${diegoName} → correctivo=Anderson`
    );
  }

  console.log(`--- ${apply ? "Novedades creadas y enlazadas" : "Se crearían/enlazarían"} (${detalle.length}) ---`);
  for (const d of detalle) console.log("  ✔ " + d);
  if (omitidos.length) {
    console.log(`\n--- Omitidos (${omitidos.length}) ---`);
    for (const o of omitidos) console.log("  • " + o);
  }
  if (faltantes.length) {
    console.log(`\n--- No encontrados (${faltantes.length}) ---`);
    for (const f of faltantes) console.log("  • " + f);
  }

  // Resumen por clasificación.
  const porGrupo = new Map<string, number>();
  for (const caseNo of CASE_NOS) {
    if (!byNo.has(caseNo)) continue;
    const g = GROUPS[CASE_CLASIF[caseNo]];
    porGrupo.set(g.code, (porGrupo.get(g.code) ?? 0) + 1);
  }
  console.log(`\n=== Resumen por código ===`);
  for (const [code, n] of Array.from(porGrupo.entries()).sort()) console.log(`  ${code}: ${n}`);

  console.log(`\n=== Totales ===`);
  console.log(`  Casos en la lista:                 ${CASE_NOS.length}`);
  console.log(`  ${apply ? "Novedades creadas:" : "Novedades a crear:"}                ${creadas}`);
  console.log(`  ${apply ? "Correctivos reasignados a Anderson:" : "Correctivos a reasignar (Anderson):"} ${reasignados}`);
  if (yaEnlazados) console.log(`  Ya estaban enlazados (saltados):   ${yaEnlazados}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló la migración:", err);
    process.exit(1);
  });
