/**
 * SOLO LECTURA. Vuelca el contenido de los casos indicados (los 46 correctivos
 * de Diego que en realidad son novedades) para poder clasificar cada uno contra
 * el catálogo de novedades antes de migrarlos.
 *
 *   npm run casos:revisar
 *
 * No escribe nada en la base.
 */
import { prisma } from "@/lib/prisma";

const CASE_NOS = [
  1802, 1801, 1800, 1799, 1798, 1797, 1796, 1795, 1791, 1794, 1793, 1792, 1790,
  1762, 1764, 1763, 1761, 1760, 1759, 1697, 1695, 1666, 1665, 1660, 1657, 1653,
  1654, 1651, 1655, 1652, 1656, 1650, 1648, 1649, 1582, 1581, 1580, 1579, 1555,
  1544, 1543, 1545, 1546, 1542, 1540, 1541,
];

function clean(s: string | null | undefined, max = 400): string {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  if (!v) return "(vacío)";
  return v.length > max ? v.slice(0, max) + "…" : v;
}

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: "CAPITALBUS" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error("✗ No se encontró el tenant.");
    process.exit(1);
  }

  const cases = await prisma.case.findMany({
    where: { tenantId: tenant.id, caseNo: { in: CASE_NOS } },
    orderBy: { caseNo: "asc" },
    select: {
      caseNo: true,
      title: true,
      description: true,
      type: true,
      status: true,
      bus: { select: { code: true, plate: true } },
      events: {
        orderBy: { createdAt: "asc" },
        select: { type: true, message: true },
      },
    },
  });

  console.log(`\nCasos encontrados: ${cases.length} de ${CASE_NOS.length}\n`);
  const faltan = CASE_NOS.filter((n) => !cases.some((c) => c.caseNo === n));
  if (faltan.length) console.log(`(No encontrados: ${faltan.join(", ")})\n`);

  for (const c of cases) {
    console.log(`#${c.caseNo} [${c.bus?.code ?? "?"} ${c.bus?.plate ?? ""}] ${c.type}/${c.status}`);
    console.log(`  Título: ${clean(c.title, 120)}`);
    console.log(`  Descripción: ${clean(c.description, 400)}`);
    const comentarios = c.events
      .filter((e) => e.message && e.message.trim())
      .map((e) => clean(e.message, 160))
      .slice(0, 4);
    if (comentarios.length) console.log(`  Comentarios: ${comentarios.join("  ||  ")}`);
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló:", err);
    process.exit(1);
  });
