/* prisma/import-placas.ts */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type Row = { busCode: string; plate: string };

function parsePlatesCsv(raw: string): Row[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Detecta delimitador: si el header tiene ';' usamos ';', si no ','.
  const header = lines[0];
  const delim = header.includes(";") ? ";" : ",";

  // Header esperado: Bus_ID;Placa  (o Bus_ID,Placa)
  // Si el archivo viniera "mal leído" como una sola columna, igual lo manejamos.
  const out: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim).map((p) => p.trim());
    if (parts.length < 2) continue;

    const busCode = parts[0];
    const plate = parts[1];

    if (!busCode || !plate) continue;

    out.push({ busCode, plate });
  }

  return out;
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
