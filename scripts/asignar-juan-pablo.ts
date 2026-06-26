/**
 * Asigna como RESPONSABLE a Juan Pablo todas las NOVEDADES cuyo "novedad reportada"
 * (noveltyState.reportedNovelty) sea uno de estos tres:
 *   - NVR no reporta al Centro de Gestión
 *   - No permite comunicación remota para acceder al video streaming
 *   - Solicita credenciales de acceso al video streaming
 *
 * Hace lo mismo que el botón "Responsable del caso": Case.assignedToId + evento ASSIGNED.
 * Idempotente (si ya está en Juan Pablo, se omite). DRY-RUN por defecto.
 *   npx tsx scripts/asignar-juan-pablo.ts
 *   npx tsx scripts/asignar-juan-pablo.ts --apply
 *   npx tsx scripts/asignar-juan-pablo.ts --by juanpablo.correo@dominio --apply
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";

const TARGETS = [
  "NVR no reporta al Centro de Gestión",
  "No permite comunicación remota para acceder al video streaming",
  "Solicita credenciales de acceso al video streaming",
];
function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
const TARGET_SET = new Set(TARGETS.map(norm));

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}
function reportedNovelty(events: Array<{ meta: unknown }>): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const rn = ((events[i].meta ?? {}) as any)?.noveltyState?.reportedNovelty;
    if (rn && String(rn).trim()) return String(rn).trim();
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const byEmail = (arg("--by") || "").toLowerCase();

  console.log(`\n=== Asignar novedades a Juan Pablo (responsable) ===`);
  console.log(`Modo: ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}\n`);
  console.log(`Tipos objetivo:`);
  for (const t of TARGETS) console.log(`  • ${t}`);
  console.log("");

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: "CAPITALBUS" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error("✗ No se encontró el tenant."); process.exit(1); }
  const tenantId = tenant.id;

  // Juan Pablo (por correo si se pasa --by, si no por nombre).
  let juan = byEmail
    ? await prisma.user.findFirst({ where: { tenantId, email: byEmail }, select: { id: true, name: true, email: true } })
    : null;
  if (!juan) {
    const matches = await prisma.user.findMany({
      where: { tenantId, name: { contains: "Juan Pablo", mode: "insensitive" } },
      select: { id: true, name: true, email: true },
    });
    if (matches.length > 1) {
      console.log(`⚠ Hay varios "Juan Pablo": usa --by <correo> para elegir.`);
      for (const m of matches) console.log(`   - ${m.name} <${m.email}>`);
      process.exit(1);
    }
    juan = matches[0] ?? null;
  }
  console.log(`Responsable: ${juan ? `${juan.name} <${juan.email}>` : "✗ NO encontrado (Juan Pablo)"}\n`);
  if (!juan) { console.error("✗ No se encontró a Juan Pablo. Pásalo con --by <correo>. (Abortado.)"); process.exit(1); }

  const novedades = await prisma.case.findMany({
    where: { tenantId, type: CaseType.NOVEDAD },
    orderBy: { caseNo: "asc" },
    select: { id: true, caseNo: true, status: true, assignedToId: true, bus: { select: { code: true } }, events: { orderBy: { createdAt: "asc" }, select: { meta: true } } },
  });

  const porTipo = new Map<string, number>();
  let yaAsignadas = 0;
  const detalle: string[] = [];

  for (const n of novedades) {
    const rn = reportedNovelty(n.events);
    if (!rn || !TARGET_SET.has(norm(rn))) continue;

    porTipo.set(rn, (porTipo.get(rn) ?? 0) + 1);
    if (n.assignedToId === juan.id) { yaAsignadas++; continue; }

    if (apply) {
      await prisma.case.update({ where: { id: n.id }, data: { assignedToId: juan.id } });
      await prisma.caseEvent.create({
        data: {
          caseId: n.id, type: CaseEventType.ASSIGNED,
          message: `Responsable del caso: ${juan.name}`,
          meta: { assignedToId: juan.id, by: juan.id, source: "asignar-juan-pablo" },
        },
      });
    }
    detalle.push(`#${n.caseNo} ${n.bus?.code ?? ""} [${n.status}] "${rn}" → ${juan.name}`);
  }

  console.log(`--- ${apply ? "Asignadas" : "Se asignarían"} (${detalle.length}) ---`);
  for (const d of detalle.slice(0, 120)) console.log("  ✔ " + d);
  if (detalle.length > 120) console.log(`  … y ${detalle.length - 120} más`);

  console.log(`\n=== Coincidencias por tipo ===`);
  for (const t of TARGETS) console.log(`  ${porTipo.get(t) ?? 0}  ${t}`);

  console.log(`\n=== Totales ===`);
  const totalMatch = Array.from(porTipo.values()).reduce((a, b) => a + b, 0);
  console.log(`  Novedades que coinciden:            ${totalMatch}`);
  console.log(`  ${apply ? "Asignadas a Juan Pablo:" : "A asignar a Juan Pablo:"}            ${detalle.length}`);
  if (yaAsignadas) console.log(`  Ya estaban en Juan Pablo (saltadas): ${yaAsignadas}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main().then(() => process.exit(0)).catch((err) => { console.error("✗ Falló:", err); process.exit(1); });
