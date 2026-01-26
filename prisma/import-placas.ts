/* prisma/import-placas.ts */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type Row = { busCode: string; plate: string | null };

function parsePlatesCsv(raw: string): Row[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const codeIdx = header.findIndex((h) => ["code", "bus", "bus_id", "buscode", "vehiculo", "biarticulado", "codigo"].includes(h));
  const plateIdx = header.findIndex((h) => ["plate", "placa"].includes(h));

  const hasHeader = codeIdx !== -1;
  const start = hasHeader ? 1 : 0;
  const out: Row[] = [];

  for (const line of lines.slice(start)) {
    const parts = line.split(sep).map((p) => p.trim());
    const rawCode = parts[hasHeader ? codeIdx : 0] ?? "";
    const busCode = rawCode.trim().toUpperCase();
    if (!busCode) continue;
    const rawPlate = parts[hasHeader && plateIdx >= 0 ? plateIdx : 1] ?? "";
    const plate = rawPlate ? rawPlate.trim() : null;
    out.push({ busCode, plate });
  }

  const map = new Map<string, Row>();
  for (const row of out) map.set(row.busCode, row);
  return Array.from(map.values());
}

async function main() {
  // Ajusta si tu archivo está en otra ruta; por defecto lo busca en raíz del proyecto.
  const filePath = path.join(process.cwd(), "Placas.csv");
  const raw = fs.readFileSync(filePath, "utf8");

  const rows = parsePlatesCsv(raw);

  if (!rows.length) {
    console.log("No se encontraron filas en el CSV.");
    return;
  }

  const tenantCode = "CAPITALBUS";
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) {
    throw new Error(`Tenant no encontrado: ${tenantCode}`);
  }

  let updated = 0;
  const missing: string[] = [];

  for (const r of rows) {
    const res = await prisma.bus.updateMany({
      where: { tenantId: tenant.id, code: r.busCode },
      data: { plate: r.plate },
    });

    if (res.count === 0) missing.push(r.busCode);
    else updated += res.count;
  }

  console.log(`Actualizaciones realizadas: ${updated}`);
  if (missing.length) {
    console.log(`Buses no encontrados (${missing.length}):`);
    console.log(missing.join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
