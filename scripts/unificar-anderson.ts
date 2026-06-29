/**
 * Unifica las cuentas "Anderson" duplicadas dentro de Anderson Rueda
 * (anderson.rueda@upk.local), para que en Casos no aparezcan "dos Anderson".
 *
 * Qué hace (idempotente):
 *   1) AUTORÍA/CREADOR: en los eventos de cada caso, los campos meta.userId / by /
 *      actorUserId que apunten a un duplicado se cambian a Anderson Rueda
 *      (esto corrige la columna "Creador" y el filtro por creador).
 *   2) RESPONSABLE: Case.assignedToId y WorkOrder.assignedToId del duplicado → Anderson Rueda.
 *   3) Desactiva (active=false) las cuentas duplicadas para que dejen de salir en los desplegables.
 *   4) Asegura que el nombre de la cuenta canónica sea exactamente "Anderson Rueda".
 *
 * Identifica como "duplicado" cualquier usuario cuyo nombre contenga "anderson"
 * y que NO sea la cuenta canónica (por correo). SIEMPRE imprime la lista para revisar.
 *
 * DRY-RUN por defecto (no escribe nada); agrega --apply para aplicar.
 *   npm run unificar:anderson
 *   npm run unificar:anderson -- --apply
 *   (opcional)  -- --tenant CAPITALBUS  --target anderson.rueda@upk.local
 */
import { prisma } from "@/lib/prisma";

const TARGET_EMAIL_DEFAULT = "anderson.rueda@upk.local";
const TARGET_NAME = "Anderson Rueda";
const META_KEYS = ["userId", "by", "actorUserId"] as const;

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const targetEmail = (arg("--target") || TARGET_EMAIL_DEFAULT).toLowerCase();

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error("✗ No se encontró el tenant.");
    process.exit(1);
  }
  const tenantId = tenant.id;

  // Cuenta canónica (destino): por correo; si no, la primera "Anderson" encontrada.
  let target = await prisma.user.findFirst({
    where: { tenantId, email: targetEmail },
    select: { id: true, name: true, email: true, active: true },
  });

  // Todas las cuentas cuyo nombre contiene "anderson".
  const candidates = await prisma.user.findMany({
    where: { tenantId, name: { contains: "anderson", mode: "insensitive" } },
    select: { id: true, name: true, email: true, active: true },
    orderBy: { name: "asc" },
  });

  if (!target) target = candidates[0] ?? null;
  if (!target) {
    console.error('✗ No existe ninguna cuenta "Anderson" en este tenant. (Abortado.)');
    process.exit(1);
  }
  const targetId = target.id;

  const dups = candidates.filter((u) => u.id !== targetId);
  const dupIds = new Set(dups.map((d) => d.id));

  console.log(`\n=== Unificar Anderson → ${TARGET_NAME} ===`);
  console.log(`Modo: ${apply ? "APLICAR (escribe en BD)" : "DRY-RUN (no toca nada)"}  ·  Tenant: ${tenantCode}`);
  console.log(`\nDestino (se conserva): ${target.name} <${target.email}> [${target.active ? "activo" : "inactivo"}]  ${targetId}`);
  console.log(`Duplicados a fusionar: ${dups.length}`);
  for (const d of dups) console.log(`   - ${d.name} <${d.email}> [${d.active ? "activo" : "inactivo"}]  ${d.id}`);

  if (!dups.length && target.name === TARGET_NAME) {
    console.log("\nNo hay nada que unificar: solo existe la cuenta canónica y ya se llama bien.");
    await prisma.$disconnect();
    return;
  }

  // 1) Autoría/creador en eventos (meta.userId / by / actorUserId).
  const toUpdate = new Map<string, Record<string, any>>();
  for (const dupId of dupIds) {
    for (const key of META_KEYS) {
      const evs = await prisma.caseEvent.findMany({
        where: { case: { tenantId }, meta: { path: [key], equals: dupId } },
        select: { id: true, meta: true },
      });
      for (const ev of evs) {
        const cur = toUpdate.get(ev.id) ?? ({ ...((ev.meta as any) ?? {}) } as Record<string, any>);
        for (const k of META_KEYS) if (cur[k] && dupIds.has(cur[k])) cur[k] = targetId;
        cur.mergedFromAnderson = true;
        toUpdate.set(ev.id, cur);
      }
    }
  }
  const metaFix = toUpdate.size;
  if (apply) {
    for (const [id, meta] of toUpdate) {
      await prisma.caseEvent.update({ where: { id }, data: { meta } });
    }
  }

  // 2) Responsable: Case.assignedToId y WorkOrder.assignedToId.
  let caseResp = 0;
  let woResp = 0;
  if (dupIds.size) {
    const ids = Array.from(dupIds);
    if (apply) {
      caseResp = (await prisma.case.updateMany({ where: { tenantId, assignedToId: { in: ids } }, data: { assignedToId: targetId } })).count;
      woResp = (await prisma.workOrder.updateMany({ where: { tenantId, assignedToId: { in: ids } }, data: { assignedToId: targetId } })).count;
    } else {
      caseResp = await prisma.case.count({ where: { tenantId, assignedToId: { in: ids } } });
      woResp = await prisma.workOrder.count({ where: { tenantId, assignedToId: { in: ids } } });
    }
  }

  // 3) Desactivar cuentas duplicadas.
  let deactivated = 0;
  if (dupIds.size) {
    if (apply) {
      deactivated = (await prisma.user.updateMany({ where: { id: { in: Array.from(dupIds) } }, data: { active: false } })).count;
    } else {
      deactivated = dupIds.size;
    }
  }

  // 4) Nombre canónico exacto.
  const renamed = target.name !== TARGET_NAME;
  if (renamed && apply) {
    await prisma.user.update({ where: { id: targetId }, data: { name: TARGET_NAME } });
  }

  console.log(`\n=== ${apply ? "Aplicado" : "Se aplicaría"} ===`);
  console.log(`  Eventos de autoría → ${TARGET_NAME}:   ${metaFix}`);
  console.log(`  Casos (responsable) → ${TARGET_NAME}:  ${caseResp}`);
  console.log(`  OTs (responsable) → ${TARGET_NAME}:    ${woResp}`);
  console.log(`  Cuentas duplicadas desactivadas:       ${deactivated}`);
  console.log(`  Nombre de la cuenta canónica:          ${renamed ? `corregido a "${TARGET_NAME}"` : "ya correcto"}`);
  if (!apply) console.log(`\n(DRY-RUN: no se escribió nada. Revisa la lista de arriba y corre con --apply para aplicar.)`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
