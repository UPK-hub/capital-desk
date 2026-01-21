import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();


function norm(s: string) {
  return (s ?? "")
    .replace(/\u00A0/g, " ") // NBSP
    .trim();
}

function splitCsvSemicolon(file: string) {
  const raw = fs.readFileSync(file, "latin1");
  const lines = raw.split(/\r?\n/).filter(Boolean);

  const header = lines[0].split(";").map(norm);

  const rows = lines.slice(1).map((line) => {
    const cols = line.split(";").map(norm);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return obj;
  });

  return rows;
}

async function main() {
  const tenantCode = "CAPITALBUS";

  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) throw new Error(`Tenant no encontrado: ${tenantCode}`);

  // Ajusta la ruta si guardaste el CSV en otro lugar
  const file = path.join(process.cwd(), "Seriales.csv");

  const rows = splitCsvSemicolon(file);

  // Mapa columna CSV -> EquipmentType.name en tu BD
  const map: Record<string, string> = {
    "BO": "BO",
    "BFE": "BFE",
    "BV1_1": "BV1_1",
    "BV1_2": "BV1_2",
    "BV1_3": "BV1_3",
    "BV1_4": "BV1_4",
    "BV2_1": "BV2_1",
    "BV2_2": "BV2_2",
    "BV3_1": "BV3_1",
    "BV3_2": "BV3_2",
    "BV3_3": "BV3_3",
    "BV3_4": "BV3_4",
    "BTE": "BTE",
    "NVR": "NVR",
  };

  let updated = 0;
  let missingBuses: string[] = [];
  let missingEquipments: Array<{ bus: string; eq: string }> = [];

  for (const r of rows) {
    const busCode = norm(r["ID Móvil"]);
    if (!busCode) continue;

    const bus = await prisma.bus.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: busCode } },
      select: { id: true, code: true },
    });

    if (!bus) {
      missingBuses.push(busCode);
      continue;
    }

    // Traemos todos los equipments del bus con su equipmentType.name para actualizar rápido
    const eqs = await prisma.busEquipment.findMany({
      where: { busId: bus.id },
      select: { id: true, equipmentType: { select: { name: true } } },
    });

    const byName = new Map(eqs.map((e) => [e.equipmentType.name, e.id]));

    // 1) Cámaras + NVR + etc
    for (const [col, eqName] of Object.entries(map)) {
      const serial = norm(r[col]);
      if (!serial) continue;

      const beId = byName.get(eqName);
      if (!beId) {
        missingEquipments.push({ bus: busCode, eq: eqName });
        continue;
      }

      await prisma.busEquipment.update({
        where: { id: beId },
        data: { serial },
      });
      updated++;
    }

    // 2) Discos Duros: serial compuesto "Disco 1 / Disco 2"
    const d1 = norm(r["Disco 1"]);
    const d2 = norm(r["Disco 2"]);
    if (d1 || d2) {
      const serial = [d1, d2].filter(Boolean).join(" / ");
      const beId = byName.get("Discos Duros");
      if (!beId) {
        missingEquipments.push({ bus: busCode, eq: "Discos Duros" });
      } else {
        await prisma.busEquipment.update({
          where: { id: beId },
          data: { serial },
        });
        updated++;
      }
    }
  }

  console.log("Actualizaciones realizadas:", updated);
  if (missingBuses.length) console.log("Buses no encontrados:", missingBuses);
  if (missingEquipments.length) console.log("Equipos faltantes:", missingEquipments);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
