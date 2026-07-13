import { prisma } from "@/lib/prisma";
import { CaseType, Prisma } from "@prisma/client";

/**
 * Cambia el CREADOR/autor de los preventivos de JUNIO 2026 a Anderson Rueda.
 * Actualiza el meta.userId (y meta.by si existe) de TODOS los eventos de esos
 * casos (evento CREATED = "creado por", y los comentarios de carga de OT).
 *
 * Dry-run por defecto; --apply para escribir.
 * Uso:  npm run fix:creador-junio
 *       npm run fix:creador-junio -- --apply [--sender anderson.rueda@upk.local]
 */
const APPLY = process.argv.includes("--apply");

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function main() {
  const senderEmail = (arg("--sender") || "anderson.rueda@upk.local").toLowerCase();

  let anderson = await prisma.user.findFirst({ where: { email: senderEmail } });
  if (!anderson) {
    anderson = await prisma.user.findFirst({
      where: { name: { contains: "Anderson", mode: "insensitive" }, active: true },
    });
  }
  if (!anderson) {
    console.error(`✗ No se encontró el usuario (${senderEmail} ni "Anderson").`);
    process.exit(1);
  }
  console.log(`Nuevo creador/autor: ${anderson.name} <${anderson.email}>`);

  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");
  const cases = await prisma.case.findMany({
    where: { type: CaseType.PREVENTIVO, createdAt: { gte: desde, lt: hasta } },
    select: { id: true },
  });
  const ids = cases.map((c) => c.id);
  console.log(`Preventivos de junio: ${ids.length}`);
  if (ids.length === 0) return void (await prisma.$disconnect());

  const conUserId = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS n FROM "CaseEvent"
    WHERE "caseId" IN (${Prisma.join(ids)}) AND meta ? 'userId' AND meta->>'userId' <> ${anderson.id}
  `);
  const conBy = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS n FROM "CaseEvent"
    WHERE "caseId" IN (${Prisma.join(ids)}) AND meta ? 'by' AND meta->>'by' <> ${anderson.id}
  `);
  console.log(`Eventos a corregir: meta.userId=${conUserId[0].n} · meta.by=${conBy[0].n}`);

  if (!APPLY) {
    console.log("SIMULACRO: nada cambiado. Usa -- --apply para aplicar.");
    await prisma.$disconnect();
    return;
  }

  const r1 = await prisma.$executeRaw(Prisma.sql`
    UPDATE "CaseEvent"
    SET meta = jsonb_set(meta, '{userId}', to_jsonb(${anderson.id}::text))
    WHERE "caseId" IN (${Prisma.join(ids)}) AND meta ? 'userId' AND meta->>'userId' <> ${anderson.id}
  `);
  const r2 = await prisma.$executeRaw(Prisma.sql`
    UPDATE "CaseEvent"
    SET meta = jsonb_set(meta, '{by}', to_jsonb(${anderson.id}::text))
    WHERE "caseId" IN (${Prisma.join(ids)}) AND meta ? 'by' AND meta->>'by' <> ${anderson.id}
  `);
  console.log(`Listo: ${r1} eventos con userId y ${r2} con by ahora apuntan a ${anderson.name}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
