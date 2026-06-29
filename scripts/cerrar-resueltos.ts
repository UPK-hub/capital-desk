/**
 * Unifica el estado "Resuelto" en "Cerrado": pasa todos los casos RESUELTO -> CERRADO.
 * (Se elimina "Resuelto" del flujo; de aquí en adelante todo lo terminado es "Cerrado".)
 *
 * Idempotente (re-correr no hace nada) y DRY-RUN por defecto.
 *   npm run cerrar:resueltos
 *   npm run cerrar:resueltos -- --apply
 *   npm run cerrar:resueltos -- --apply --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus } from "@prisma/client";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";

  console.log(`\n=== Resuelto → Cerrado ===`);
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

  const rows = await prisma.case.findMany({
    where: { tenantId, status: CaseStatus.RESUELTO },
    select: { id: true, caseNo: true },
    orderBy: { caseNo: "asc" },
  });

  console.log(`Casos en estado RESUELTO: ${rows.length}`);

  if (apply && rows.length) {
    await prisma.case.updateMany({
      where: { tenantId, status: CaseStatus.RESUELTO },
      data: { status: CaseStatus.CERRADO },
    });
    // Deja constancia del cambio en el histórico de cada caso (en lotes).
    const data = rows.map((r) => ({
      caseId: r.id,
      type: CaseEventType.STATUS_CHANGE,
      message: "Caso cerrado (se unificó el estado Resuelto en Cerrado).",
      meta: { auto: true, from: "RESUELTO", to: "CERRADO", source: "cerrar-resueltos" },
    }));
    for (let i = 0; i < data.length; i += 100) {
      await prisma.caseEvent.createMany({ data: data.slice(i, i + 100) });
    }
    console.log(`✔ ${rows.length} casos pasados a CERRADO.`);
  } else if (!apply) {
    console.log(`(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  } else {
    console.log(`No hay casos RESUELTO. Nada que hacer.`);
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló:", err);
    process.exit(1);
  });
