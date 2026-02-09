import { prisma } from "@/lib/prisma";

const isCameraType = (name: string) =>
  name.startsWith("BV") || name === "BFE" || name === "BTE" || name === "BO";

async function main() {
  const types = await prisma.equipmentType.findMany({
    select: { id: true, name: true },
  });

  const targetTypeIds = types
    .filter((t) => isCameraType(t.name) || t.name === "NVR" || t.name === "Discos Duros")
    .map((t) => t.id);

  if (!targetTypeIds.length) {
    console.log("No se encontraron tipos de equipo para actualizar.");
    return;
  }

  const updated = await prisma.busEquipment.updateMany({
    where: {
      equipmentTypeId: { in: targetTypeIds },
    },
    data: {
      brand: "Hikvision",
    },
  });

  console.log(`OK: actualizados ${updated.count} equipos a marca Hikvision.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error actualizando marcas:", error);
    process.exit(1);
  });
