/**
 * Lista los casos PREVENTIVO importados (bus + fecha) con su # de caso y genera
 * un CSV (preventivos-importados.csv) para enviar al equipo (actualizar evidencias).
 * Solo lectura. Ejecuta DESPUÉS de haber corrido la importación con --apply.
 *
 *   npm run export:preventivos
 *   npm run export:preventivos -- --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseType } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const DATA: { bus: number; fecha: string }[] = [
  { bus: 1407, fecha: "2026-06-18" }, { bus: 1410, fecha: "2026-06-10" }, { bus: 1417, fecha: "2026-06-20" },
  { bus: 1422, fecha: "2026-06-18" }, { bus: 1423, fecha: "2026-06-18" }, { bus: 1426, fecha: "2026-06-15" },
  { bus: 1428, fecha: "2026-06-18" }, { bus: 1430, fecha: "2026-06-20" }, { bus: 1431, fecha: "2026-06-18" },
  { bus: 1434, fecha: "2026-06-20" }, { bus: 1438, fecha: "2026-06-18" }, { bus: 1439, fecha: "2026-06-12" },
  { bus: 1441, fecha: "2026-06-12" }, { bus: 1452, fecha: "2026-06-12" }, { bus: 1463, fecha: "2026-06-17" },
  { bus: 1474, fecha: "2026-06-12" }, { bus: 1482, fecha: "2026-06-17" }, { bus: 1487, fecha: "2026-06-12" },
  { bus: 1488, fecha: "2026-06-22" }, { bus: 1490, fecha: "2026-06-22" }, { bus: 1492, fecha: "2026-06-12" },
  { bus: 1498, fecha: "2026-06-22" }, { bus: 1502, fecha: "2026-06-22" }, { bus: 1509, fecha: "2026-06-16" },
  { bus: 1511, fecha: "2026-06-22" }, { bus: 1515, fecha: "2026-06-12" }, { bus: 1520, fecha: "2026-06-12" },
  { bus: 1527, fecha: "2026-06-16" }, { bus: 1530, fecha: "2026-06-13" }, { bus: 1533, fecha: "2026-06-13" },
  { bus: 1536, fecha: "2026-06-17" }, { bus: 1544, fecha: "2026-06-17" }, { bus: 1546, fecha: "2026-06-13" },
  { bus: 1558, fecha: "2026-06-14" }, { bus: 1564, fecha: "2026-06-18" }, { bus: 1567, fecha: "2026-06-15" },
  { bus: 1569, fecha: "2026-06-16" }, { bus: 1577, fecha: "2026-06-22" }, { bus: 1582, fecha: "2026-06-22" },
  { bus: 1584, fecha: "2026-06-22" }, { bus: 1604, fecha: "2026-06-15" }, { bus: 1607, fecha: "2026-06-17" },
  { bus: 1611, fecha: "2026-06-22" }, { bus: 1616, fecha: "2026-06-15" }, { bus: 1619, fecha: "2026-06-19" },
  { bus: 1623, fecha: "2026-06-12" }, { bus: 1625, fecha: "2026-06-19" }, { bus: 1626, fecha: "2026-06-19" },
  { bus: 1627, fecha: "2026-06-12" }, { bus: 1628, fecha: "2026-06-19" }, { bus: 1630, fecha: "2026-06-19" },
  { bus: 1631, fecha: "2026-06-19" }, { bus: 1634, fecha: "2026-06-17" }, { bus: 1638, fecha: "2026-06-18" },
  { bus: 1646, fecha: "2026-06-22" }, { bus: 1647, fecha: "2026-06-15" }, { bus: 1649, fecha: "2026-06-16" },
  { bus: 1657, fecha: "2026-06-19" },
];

function atCot(fecha: string, hhmm: string) {
  return new Date(`${fecha}T${hhmm}:00-05:00`);
}

async function main() {
  const args = process.argv.slice(2);
  const tIdx = args.indexOf("--tenant");
  const tenantCode = tIdx >= 0 ? args[tIdx + 1] : "CAPITALBUS";

  const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode } });
  if (!tenant) {
    console.error(`✗ No se encontró tenant con code="${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const found: { caseNo: number | null; code: string; fecha: string; estado: string; title: string }[] = [];
  const missing: number[] = [];

  for (const row of DATA) {
    let bus: { id: string; code: string } | null = null;
    for (const code of [`K${row.bus}`, `${row.bus}`, `k${row.bus}`]) {
      bus = await prisma.bus.findFirst({ where: { tenantId, code }, select: { id: true, code: true } });
      if (bus) break;
    }
    if (!bus) {
      missing.push(row.bus);
      continue;
    }
    const dayStart = atCot(row.fecha, "00:00");
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const c = await prisma.case.findFirst({
      where: { tenantId, busId: bus.id, type: CaseType.PREVENTIVO, createdAt: { gte: dayStart, lt: dayEnd } },
      select: { caseNo: true, status: true, title: true },
      orderBy: { createdAt: "desc" },
    });
    if (!c) {
      missing.push(row.bus);
      continue;
    }
    found.push({ caseNo: c.caseNo, code: bus.code, fecha: row.fecha, estado: c.status, title: c.title });
  }

  found.sort((a, b) => (a.caseNo ?? 0) - (b.caseNo ?? 0));

  console.log("");
  console.log(`Casos preventivos encontrados: ${found.length} / ${DATA.length}`);
  console.log("");
  console.log("# Caso | Bus     | Fecha       | Estado");
  console.log("-------|---------|-------------|--------");
  for (const f of found) {
    console.log(`${String(f.caseNo).padEnd(6)} | ${f.code.padEnd(7)} | ${f.fecha} | ${f.estado}`);
  }
  if (missing.length) {
    console.log("");
    console.log(`No encontrados (${missing.length}): ${missing.join(", ")}`);
  }
  console.log("");
  console.log("Números de caso: " + found.map((f) => f.caseNo).join(", "));

  // CSV (con BOM para que Excel respete acentos)
  const header = "# Caso,Bus,Fecha,Estado,Titulo";
  const lines = found.map(
    (f) => `${f.caseNo},${f.code},${f.fecha},${f.estado},"${(f.title ?? "").replace(/"/g, '""')}"`
  );
  const csv = "﻿" + [header, ...lines].join("\r\n");
  const out = path.join(process.cwd(), "preventivos-importados.csv");
  fs.writeFileSync(out, csv, "utf8");
  console.log("");
  console.log(`✓ CSV generado: ${out}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Export falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
