/**
 * Normaliza los creadores de la migración "novedad de origen":
 *   - NOVEDADES creadas por la migración  → creador = Daniel Osorio
 *   - CORRECTIVOS enlazados a esas novedades → creador = Anderson Rueda
 *
 * Identifica las novedades de la migración por su evento CREATED con meta.migrated = true.
 * Sobrescribe el creador en todas las llaves de actor (userId/by/actorUserId) para que
 * la UI (filtro y columna "Creador") lo refleje.
 *
 * Idempotente y DRY-RUN por defecto (no escribe nada). Muestra qué cambiaría.
 *   npm run fix:creadores
 *   npm run fix:creadores -- --apply
 *   npm run fix:creadores -- --apply --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function resolveUser(tenantId: string, email: string | null, tokens: string[]) {
  if (email) {
    const u = await prisma.user.findFirst({ where: { tenantId, email: email.toLowerCase() }, select: { id: true, name: true, email: true } });
    if (u) return u;
  }
  for (const t of tokens) {
    const u = await prisma.user.findFirst({
      where: { tenantId, name: { contains: t, mode: "insensitive" } },
      select: { id: true, name: true, email: true },
    });
    if (u) return u;
  }
  return null;
}

function actorIdOf(meta: any): string | null {
  const id = meta?.userId ?? meta?.by ?? meta?.actorUserId;
  return id ? String(id) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";

  console.log(`\n=== Normalizar creadores (novedad→Daniel, correctivo→Anderson) ===`);
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

  const daniel = await resolveUser(tenantId, arg("--daniel"), ["Daniel Osorio", "Osorio"]);
  const anderson = await resolveUser(tenantId, arg("--anderson") || "anderson.rueda@upk.local", ["Anderson Rueda", "Anderson"]);
  console.log(`Creador novedades  (Daniel):   ${daniel ? `${daniel.name} <${daniel.email}>` : "✗ NO encontrado"}`);
  console.log(`Creador correctivos (Anderson): ${anderson ? `${anderson.name} <${anderson.email}>` : "✗ NO encontrado"}\n`);
  if ((!daniel || !anderson) && apply) {
    console.error("✗ Faltan usuarios por resolver. Usa --daniel <correo> / --anderson <correo>. (Abortado.)");
    process.exit(1);
  }

  // Novedades creadas por la migración (evento CREATED con meta.migrated = true)
  const novedades = await prisma.case.findMany({
    where: {
      tenantId,
      type: CaseType.NOVEDAD,
      events: { some: { type: CaseEventType.CREATED, meta: { path: ["migrated"], equals: true } } },
    },
    orderBy: { caseNo: "asc" },
    select: {
      id: true,
      caseNo: true,
      events: { select: { id: true, type: true, meta: true } },
    },
  });

  let novFix = 0;
  let corrFix = 0;
  const detalle: string[] = [];

  for (const nov of novedades) {
    // 1) Novedad → creador Daniel
    let novChanged = false;
    if (daniel) {
      for (const ev of nov.events) {
        if (ev.type !== CaseEventType.CREATED) continue;
        const m = (ev.meta ?? {}) as any;
        if (actorIdOf(m) === daniel.id) continue; // ya está bien
        novChanged = true;
        if (apply) {
          await prisma.caseEvent.update({
            where: { id: ev.id },
            data: { meta: { ...m, userId: daniel.id, by: daniel.id, actorUserId: daniel.id } },
          });
        }
      }
    }
    if (novChanged) novFix++;

    // 2) Correctivo enlazado (meta.sourceCaseId = nov.id) → creador Anderson
    let corrChanged = false;
    const corr = await prisma.case.findFirst({
      where: {
        tenantId,
        type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] },
        events: { some: { meta: { path: ["sourceCaseId"], equals: nov.id } } },
      },
      select: { id: true, caseNo: true, events: { select: { id: true, type: true, meta: true } } },
    });
    if (corr && anderson) {
      for (const ev of corr.events) {
        if (ev.type !== CaseEventType.CREATED) continue;
        const m = (ev.meta ?? {}) as any;
        if (actorIdOf(m) === anderson.id) continue;
        corrChanged = true;
        if (apply) {
          await prisma.caseEvent.update({
            where: { id: ev.id },
            data: { meta: { ...m, userId: anderson.id, by: anderson.id, actorUserId: anderson.id, creatorReassigned: true } },
          });
        }
      }
    }
    if (corrChanged) corrFix++;

    if (novChanged || corrChanged) {
      detalle.push(
        `Novedad #${nov.caseNo}${novChanged ? " → Daniel" : ""}` +
          (corr ? ` | correctivo #${corr.caseNo}${corrChanged ? " → Anderson" : ""}` : " | (sin correctivo enlazado)")
      );
    }
  }

  console.log(`--- ${apply ? "Cambios aplicados" : "Cambios que se aplicarían"} (${detalle.length}) ---`);
  for (const d of detalle) console.log("  ✔ " + d);

  console.log(`\n=== Totales ===`);
  console.log(`  Novedades de migración encontradas: ${novedades.length}`);
  console.log(`  ${apply ? "Novedades con creador corregido:" : "Novedades a corregir (Daniel):"}  ${novFix}`);
  console.log(`  ${apply ? "Correctivos con creador corregido:" : "Correctivos a corregir (Anderson):"} ${corrFix}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló la normalización:", err);
    process.exit(1);
  });
