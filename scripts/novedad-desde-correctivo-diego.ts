/**
 * Migra los 46 CORRECTIVOS creados por Diego (que en realidad eran NOVEDADES de
 * CCTV) a su novedad de origen, clasificando CADA UNO contra el catálogo.
 *
 * Por cada correctivo de la lista:
 *   1) Crea una NOVEDAD de origen:
 *        - CREADOR    = Diego (se toma del evento de creación del correctivo).
 *        - RESPONSABLE = Anderson Rueda (Case.assignedToId + evento ASSIGNED).
 *        - Hereda bus, estado, prioridad y fecha de creación del correctivo.
 *        - FECHA DE RESOLUCIÓN: si el correctivo está resuelto/cerrado, se crea un
 *          evento STATUS_CHANGE con la fecha real de cierre del correctivo
 *          (workOrder.finishedAt, o su último STATUS_CHANGE), para que la bandeja
 *          de Novedades muestre esa fecha y NO la de hoy.
 *   2) Reasigna el CORRECTIVO a Anderson (creador + responsable). Conserva tipo/OT.
 *   3) Enlaza el correctivo a la novedad (CaseEvent meta.sourceCaseId).
 *
 * Clasificación por caso (decidida con Valeria contra el catálogo):
 *   - "No permite comunicación remota / no accede al video streaming" → NVD-207 (NVR)
 *   - "Cámara mal direccionada"                                       → NVD-313 (Cámaras)
 *   - "Ausencia de etiqueta que indique coordenadas"                  → NVD-522 (NVR)  [código nuevo]
 *   - "Domo sucio"                                                    → NVD-315 (Cámaras)
 *   - "Solicita credenciales de acceso al video streaming"           → NVD-500 (CMS)
 *
 * Una novedad por CADA correctivo (46). IDEMPOTENTE: si la novedad ya existe, no
 * la duplica; solo completa lo que falte (responsable y fecha de resolución).
 * DRY-RUN por defecto.  npm run novedad:diego  |  npm run novedad:diego -- --apply
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType, CaseStatus } from "@prisma/client";
import { nextNumbers } from "@/lib/tenant-sequence";

type GroupKey = "A" | "DIR" | "ETIQ" | "DOMO" | "CRED";

const GROUPS: Record<GroupKey, { code: string; equipment: string; novelty: string }> = {
  A:    { code: "NVD-207", equipment: "NVR",     novelty: "No permite comunicación remota para acceder al video streaming" },
  DIR:  { code: "NVD-313", equipment: "CAMARAS", novelty: "Cámara mal direccionada" },
  ETIQ: { code: "NVD-522", equipment: "NVR",     novelty: "Ausencia de etiqueta que indique coordenadas" },
  DOMO: { code: "NVD-315", equipment: "CAMARAS", novelty: "Domo sucio" },
  CRED: { code: "NVD-500", equipment: "CMS",     novelty: "Solicita credenciales de acceso al video streaming" },
};

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
const BATCH = "diego-cctv-2026-06";
const CLOSED = new Set<CaseStatus>([CaseStatus.RESUELTO, CaseStatus.CERRADO]);

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}
function metaVal(meta: unknown, field: string): string | null {
  const v = ((meta ?? {}) as any)?.[field];
  return v && String(v).trim() ? String(v).trim() : null;
}
function originalCreatorId(meta: unknown): string | null {
  return metaVal(meta, "userId") ?? metaVal(meta, "by") ?? metaVal(meta, "actorUserId");
}
// Última fecha en que un caso cambió de estado (createdAt del último STATUS_CHANGE).
function lastStatusChangeAt(events: Array<{ type: any; createdAt: Date }>): Date | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === CaseEventType.STATUS_CHANGE) return events[i].createdAt;
  }
  return null;
}
function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "(sin fecha)";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const forcedByEmail = (arg("--by") || "").toLowerCase();

  console.log(`\n=== Migrar 46 correctivos de Diego → novedades (clasificadas) ===`);
  console.log(`Modo:   ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant: ${tenantCode}`);
  console.log(`Casos:  ${CASE_NOS.length}\n`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error(`✗ No se encontró el tenant "${tenantCode}".`); process.exit(1); }
  const tenantId = tenant.id;

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
  console.log(`Anderson (creador correctivo + responsable): ${anderson ? `${anderson.name} <${anderson.email}>` : "✗ NO encontrado"}`);
  if (!anderson && apply) { console.error("✗ No se encontró a Anderson Rueda. (Abortado.)"); process.exit(1); }
  const andersonId = anderson?.id ?? null;
  const andersonName = anderson?.name ?? "Anderson Rueda";

  const forcedCreator = forcedByEmail
    ? await prisma.user.findFirst({ where: { tenantId, email: forcedByEmail }, select: { id: true, name: true, email: true } })
    : null;
  if (forcedByEmail && !forcedCreator) console.log(`(Aviso: --by ${forcedByEmail} no coincide con ningún usuario.)`);
  if (forcedCreator) console.log(`Novedades → creador forzado: ${forcedCreator.name} <${forcedCreator.email}>`);

  const cases = await prisma.case.findMany({
    where: { tenantId, caseNo: { in: CASE_NOS } },
    orderBy: { caseNo: "asc" },
    include: {
      bus: { select: { code: true, plate: true } },
      workOrder: { select: { finishedAt: true } },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, meta: true, createdAt: true } },
    },
  });
  const byNo = new Map(cases.map((c) => [c.caseNo, c]));

  const creatorIds = new Set<string>();
  for (const c of cases)
    for (const ev of c.events.filter((e) => e.type === CaseEventType.CREATED)) {
      const id = metaVal(ev.meta, "originalCreatorId") ?? originalCreatorId(ev.meta);
      if (id) creatorIds.add(id);
    }
  const creatorUsers = await prisma.user.findMany({
    where: { tenantId, id: { in: Array.from(creatorIds) } },
    select: { id: true, name: true },
  });
  const creatorById = new Map(creatorUsers.map((u) => [u.id, u]));

  const detalle: string[] = [];
  const omitidos: string[] = [];
  const faltantes: string[] = [];
  let novedadesCreadas = 0, novedadesRespFix = 0, resolucionFix = 0, correctivosCreatorFix = 0, correctivosRespFix = 0;

  for (const caseNo of CASE_NOS) {
    const grp = GROUPS[CASE_CLASIF[caseNo]];
    const corr = byNo.get(caseNo);
    if (!corr) { faltantes.push(`#${caseNo} (no existe)`); continue; }
    if (corr.type !== CaseType.CORRECTIVO) { omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (no es correctivo: ${corr.type})`); continue; }

    const createdEvents = corr.events.filter((e) => e.type === CaseEventType.CREATED);
    const linkEvent = corr.events.find((e) => metaVal(e.meta, "sourceCaseId"));
    const existingNovedadId = linkEvent ? metaVal(linkEvent.meta, "sourceCaseId") : null;

    const diegoId =
      forcedCreator?.id ??
      createdEvents.map((e) => metaVal(e.meta, "originalCreatorId")).find(Boolean) ??
      createdEvents.map((e) => originalCreatorId(e.meta)).find((id) => id && id !== andersonId) ??
      createdEvents.map((e) => originalCreatorId(e.meta)).find(Boolean) ??
      null;
    const diegoName = diegoId ? (creatorById.get(diegoId)?.name ?? forcedCreator?.name ?? diegoId) : "(desconocido)";

    // Fecha real de cierre del correctivo (para la fecha de resolución de la novedad).
    const isClosed = CLOSED.has(corr.status);
    const closeDate = corr.workOrder?.finishedAt ?? lastStatusChangeAt(corr.events);

    const acciones: string[] = [];

    if (apply) {
      await prisma.$transaction(async (tx) => {
        let novedadId = existingNovedadId;

        if (!novedadId) {
          if (!diegoId) { omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (no se pudo identificar a Diego; usa --by <correo>)`); return; }
          const { caseNo: novNo } = await nextNumbers(tx, tenantId, { case: true });
          const novedadCaseNo = novNo as number;
          const batchRef = `NVD-${String(novedadCaseNo).padStart(4, "0")}`;

          const novedad = await tx.case.create({
            data: {
              tenantId, caseNo: novedadCaseNo, busId: corr.busId, busEquipmentId: corr.busEquipmentId ?? null,
              type: CaseType.NOVEDAD, status: corr.status, priority: corr.priority,
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
          novedadId = novedad.id;
          await tx.caseEvent.create({
            data: {
              caseId: novedad.id, type: CaseEventType.CREATED, createdAt: corr.createdAt,
              message: "Caso creado (novedad de origen, migración Diego)",
              meta: {
                userId: diegoId, migrated: true, migrationBatch: BATCH, originalCorrectivoNo: corr.caseNo,
                noveltyState: { batchRef, catalogCode: grp.code, affectedEquipment: grp.equipment, reportedNovelty: grp.novelty, observations: corr.title },
              },
            },
          });
          await tx.$executeRaw`UPDATE "Case" SET "updatedAt" = ${corr.updatedAt} WHERE "id" = ${novedad.id}`;
          for (const ev of createdEvents) {
            const m = (ev.meta ?? {}) as any;
            await tx.caseEvent.update({ where: { id: ev.id }, data: { meta: { ...m, userId: andersonId, by: andersonId, actorUserId: andersonId, creatorReassigned: true, originalCreatorId: diegoId } } });
          }
          correctivosCreatorFix++;
          await tx.caseEvent.create({
            data: { caseId: corr.id, type: CaseEventType.COMMENT, message: `Atado a novedad #${novedadCaseNo}`, meta: { sourceCaseId: novedad.id, sourceCaseNo: novedadCaseNo, batchRef, migrated: true, migrationBatch: BATCH } },
          });
          novedadesCreadas++;
          acciones.push("novedad creada");
        }

        // Estado actual de la novedad (nueva o existente).
        const nov = await tx.case.findUnique({
          where: { id: novedadId! },
          select: { assignedToId: true, events: { select: { type: true, meta: true } } },
        });

        // Responsable de la novedad = Anderson.
        if (nov && andersonId && nov.assignedToId !== andersonId) {
          await tx.case.update({ where: { id: novedadId! }, data: { assignedToId: andersonId } });
          await tx.caseEvent.create({ data: { caseId: novedadId!, type: CaseEventType.ASSIGNED, message: `Responsable del caso: ${andersonName}`, meta: { assignedToId: andersonId, by: andersonId, source: "migracion-diego" } } });
          novedadesRespFix++;
          acciones.push("responsable novedad→Anderson");
        }

        // Fecha de resolución = cierre real del correctivo (evento STATUS_CHANGE).
        const yaTieneResol = !!nov?.events.some((e) => e.type === CaseEventType.STATUS_CHANGE && metaVal(e.meta, "migrationBatch") === BATCH);
        if (isClosed && closeDate && !yaTieneResol) {
          await tx.caseEvent.create({
            data: {
              caseId: novedadId!, type: CaseEventType.STATUS_CHANGE, createdAt: closeDate,
              message: `Estado: ${corr.status}`,
              meta: { status: corr.status, migrated: true, migrationBatch: BATCH, by: andersonId, resolvedFromCorrectivo: corr.caseNo },
            },
          });
          resolucionFix++;
          acciones.push(`resolución→${fmt(closeDate)}`);
        }

        // Responsable del correctivo = Anderson.
        if (andersonId && corr.assignedToId !== andersonId) {
          await tx.case.update({ where: { id: corr.id }, data: { assignedToId: andersonId } });
          await tx.caseEvent.create({ data: { caseId: corr.id, type: CaseEventType.ASSIGNED, message: `Responsable del caso: ${andersonName}`, meta: { assignedToId: andersonId, by: andersonId, source: "migracion-diego" } } });
          correctivosRespFix++;
          acciones.push("responsable correctivo→Anderson");
        }
      });
    } else {
      // PRUEBA (solo lectura).
      if (!existingNovedadId) {
        if (!diegoId) { omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (no se pudo identificar a Diego)`); continue; }
        acciones.push("crearía novedad", "responsable novedad→Anderson", "correctivo→Anderson");
        novedadesCreadas++; novedadesRespFix++; correctivosCreatorFix++;
        if (isClosed && closeDate) { acciones.push(`resolución→${fmt(closeDate)}`); resolucionFix++; }
      } else {
        const nov = await prisma.case.findUnique({ where: { id: existingNovedadId }, select: { assignedToId: true, events: { select: { type: true, meta: true } } } });
        if (nov && nov.assignedToId !== andersonId) { acciones.push("responsable novedad→Anderson"); novedadesRespFix++; }
        const yaResol = !!nov?.events.some((e) => e.type === CaseEventType.STATUS_CHANGE && metaVal(e.meta, "migrationBatch") === BATCH);
        if (isClosed && closeDate && !yaResol) { acciones.push(`resolución→${fmt(closeDate)}`); resolucionFix++; }
      }
      if (andersonId && corr.assignedToId !== andersonId) { acciones.push("responsable correctivo→Anderson"); correctivosRespFix++; }
      if (acciones.length === 0) { omitidos.push(`#${caseNo} ${corr.bus?.code ?? ""} (ya estaba completo)`); continue; }
    }

    if (acciones.length)
      detalle.push(`#${corr.caseNo} ${corr.bus?.code ?? ""} [${corr.status}] ${grp.code}/${grp.equipment} · creador=${diegoName} · cierre real=${fmt(closeDate)} · ${acciones.join(" · ")}`);
  }

  console.log(`--- ${apply ? "Aplicado" : "Se haría"} (${detalle.length}) ---`);
  for (const d of detalle) console.log("  ✔ " + d);
  if (omitidos.length) { console.log(`\n--- Sin cambios / omitidos (${omitidos.length}) ---`); for (const o of omitidos) console.log("  • " + o); }
  if (faltantes.length) { console.log(`\n--- No encontrados (${faltantes.length}) ---`); for (const f of faltantes) console.log("  • " + f); }

  const porGrupo = new Map<string, number>();
  for (const caseNo of CASE_NOS) { if (!byNo.has(caseNo)) continue; const g = GROUPS[CASE_CLASIF[caseNo]]; porGrupo.set(g.code, (porGrupo.get(g.code) ?? 0) + 1); }
  console.log(`\n=== Resumen por código ===`);
  for (const [code, n] of Array.from(porGrupo.entries()).sort()) console.log(`  ${code}: ${n}`);

  console.log(`\n=== Totales ===`);
  console.log(`  Casos en la lista:                  ${CASE_NOS.length}`);
  console.log(`  ${apply ? "Novedades creadas:" : "Novedades a crear:"}                 ${novedadesCreadas}`);
  console.log(`  ${apply ? "Responsable novedad → Anderson:" : "Responsable novedad a poner:"}     ${novedadesRespFix}`);
  console.log(`  ${apply ? "Fecha de resolución corregida:" : "Fecha de resolución a corregir:"}    ${resolucionFix}`);
  console.log(`  ${apply ? "Correctivos creador → Anderson:" : "Correctivos creador a reasignar:"}  ${correctivosCreatorFix}`);
  console.log(`  ${apply ? "Responsable correctivo → Anderson:" : "Responsable correctivo a poner:"}  ${correctivosRespFix}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main().then(() => process.exit(0)).catch((err) => { console.error("✗ Falló la migración:", err); process.exit(1); });
