/**
 * Crea una NOVEDAD de origen para cada CORRECTIVO cuyo título menciona P20/P60
 * (que en realidad eran novedades "NVR no reporta al centro de gestión") y enlaza
 * el correctivo a esa novedad.
 *
 *   - El correctivo NO se toca: conserva tipo, OT y toda su información.
 *   - La novedad se clasifica estandarizada con el catálogo:
 *       equipo afectado = NVR
 *       novedad reportada = "NVR no reporta al centro de gestión"
 *       código de referencia = NVD-200 (Bus no reporta al Centro de Gestión)
 *     y conserva el texto original (posiciones P60/P20) en la descripción.
 *   - La novedad hereda del correctivo: bus, estado, prioridad y fecha de creación
 *     (y la de actualización/cierre).
 *   - Enlace: se crea un CaseEvent en el correctivo con meta.sourceCaseId = novedad.id
 *     (misma convención que el botón "Atar a novedad").
 *
 * Idempotente: si el correctivo ya está enlazado a una novedad, se omite.
 * DRY-RUN por defecto (no escribe nada). Muestra la lista encontrada.
 *   npm run novedad:desde-correctivo
 *   npm run novedad:desde-correctivo -- --apply
 *   npm run novedad:desde-correctivo -- --apply --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";
import { nextNumbers } from "@/lib/tenant-sequence";

const CATALOG_CODE = "NVD-200";
const AFFECTED_EQUIPMENT = "NVR";
const REPORTED_NOVELTY = "NVR no reporta al centro de gestión";

// El título debe mencionar P20 o P60 (con o sin "sin"): "Sin P60;P20", "P20 Y P60", etc.
const POS_REGEX = /\bp\s?(20|60)\b/i;

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const byEmail = (arg("--by") || "gerenciatactica@upkeepservices.com.co").toLowerCase();

  console.log(`\n=== Crear novedad de origen para correctivos "Sin P20/P60" ===`);
  console.log(`Modo:   ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant: ${tenantCode}`);
  console.log(`Estándar: equipo=${AFFECTED_EQUIPMENT} · "${REPORTED_NOVELTY}" · código ${CATALOG_CODE}\n`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error(`✗ No se encontró el tenant "${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const operator = await prisma.user.findFirst({ where: { tenantId, email: byEmail }, select: { id: true, name: true } });
  const operatorId = operator?.id;
  console.log(`Operador del registro: ${operator ? operator.name : `(no encontrado ${byEmail}; se omite "by")`}\n`);

  // Candidatos: correctivos cuyo título menciona P20 o P60
  const candidates = await prisma.case.findMany({
    where: {
      tenantId,
      type: CaseType.CORRECTIVO,
      OR: [
        { title: { contains: "P20", mode: "insensitive" } },
        { title: { contains: "P60", mode: "insensitive" } },
      ],
    },
    orderBy: { caseNo: "asc" },
    include: {
      bus: { select: { code: true, plate: true } },
      events: { orderBy: { createdAt: "asc" }, select: { meta: true } },
    },
  });

  const targets = candidates.filter((c) => POS_REGEX.test(c.title));

  let creadas = 0;
  let yaEnlazados = 0;
  const detalle: string[] = [];
  const omitidos: string[] = [];

  for (const corr of targets) {
    // Idempotencia: ¿ya está enlazado a una novedad?
    const alreadyLinked = corr.events.some((e) => {
      const meta = (e.meta ?? {}) as any;
      return Boolean(meta?.sourceCaseId);
    });
    if (alreadyLinked) {
      yaEnlazados++;
      omitidos.push(`#${corr.caseNo} ${corr.bus.code} (ya enlazado)`);
      continue;
    }

    if (apply) {
      await prisma.$transaction(async (tx) => {
        const { caseNo } = await nextNumbers(tx, tenantId, { case: true });
        const novedadCaseNo = caseNo as number;
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
            title: `Novedad ${corr.bus.code} - ${REPORTED_NOVELTY}`,
            description: [
              `Código novedad: ${CATALOG_CODE}`,
              `Equipo afectado: ${AFFECTED_EQUIPMENT}`,
              `Novedad reportada: ${REPORTED_NOVELTY}`,
              `Referencia original (correctivo #${corr.caseNo}): ${corr.title}`,
            ].join("\n"),
            createdAt: corr.createdAt,
          },
        });

        // Evento con la clasificación (noveltyState) — la bandeja de Novedades lo lee de aquí.
        await tx.caseEvent.create({
          data: {
            caseId: novedad.id,
            type: CaseEventType.CREATED,
            message: "Caso creado (novedad de origen, migración)",
            createdAt: corr.createdAt,
            meta: {
              userId: operatorId,
              migrated: true,
              noveltyState: {
                batchRef,
                catalogCode: CATALOG_CODE,
                affectedEquipment: AFFECTED_EQUIPMENT,
                reportedNovelty: REPORTED_NOVELTY,
                observations: corr.title,
              },
            },
          },
        });

        // Alinear updatedAt/cierre de la novedad con el del correctivo (campo @updatedAt).
        await tx.$executeRaw`UPDATE "Case" SET "updatedAt" = ${corr.updatedAt} WHERE "id" = ${novedad.id}`;

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
              linkedBy: operatorId,
              migrated: true,
            },
          },
        });
      });
    }

    creadas++;
    detalle.push(`#${corr.caseNo} ${corr.bus.code} [${corr.status}] "${corr.title}"`);
  }

  console.log(`--- ${apply ? "Novedades creadas y enlazadas" : "Se crearían/enlazarían"} (${detalle.length}) ---`);
  for (const d of detalle) console.log("  ✔ " + d);
  if (omitidos.length) {
    console.log(`\n--- Omitidos: ya enlazados (${omitidos.length}) ---`);
    for (const o of omitidos) console.log("  • " + o);
  }

  console.log(`\n=== Totales ===`);
  console.log(`  Correctivos encontrados (P20/P60): ${targets.length}`);
  console.log(`  ${apply ? "Novedades creadas:" : "Novedades a crear:"}        ${creadas}`);
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
