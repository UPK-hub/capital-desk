import { prisma } from "@/lib/prisma";

const REQUIRED_EQUIPMENT_TYPES = ["Baterias", "Controlador de carga"];

async function main() {
  for (const name of REQUIRED_EQUIPMENT_TYPES) {
    await prisma.equipmentType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const types = await prisma.equipmentType.findMany({
    where: { name: { in: REQUIRED_EQUIPMENT_TYPES } },
    select: { id: true, name: true },
  });

  const buses = await prisma.bus.findMany({ select: { id: true, code: true, tenantId: true } });

  let created = 0;
  for (const bus of buses) {
    const existing = await prisma.busEquipment.findMany({
      where: { busId: bus.id, equipmentTypeId: { in: types.map((t) => t.id) } },
      select: { equipmentTypeId: true },
    });
    const existingSet = new Set(existing.map((e) => e.equipmentTypeId));

    for (const t of types) {
      if (existingSet.has(t.id)) continue;
      await prisma.busEquipment.create({
        data: { busId: bus.id, equipmentTypeId: t.id, active: true },
      });
      created++;
    }
  }

  console.log(`OK: creados ${created} equipos faltantes (${REQUIRED_EQUIPMENT_TYPES.join(", ")})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error asegurando equipos:", error);
    process.exit(1);
  });
