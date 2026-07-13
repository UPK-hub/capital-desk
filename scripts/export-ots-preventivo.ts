import { prisma } from "@/lib/prisma";
import { readUploadBinary } from "@/lib/uploads";
import { CaseType } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

/**
 * DESCARGA todas las OT (PDF del slot "Archivo de la OT") de los casos
 * PREVENTIVO de junio 2026 a una carpeta local, para poder borrarlos y
 * volverlos a cargar después con `npm run import:ot-preventivo`.
 *
 * - Lee el archivo de disco o del respaldo en BD (readUploadBinary).
 * - Guarda cada PDF con su nombre original (que ya trae el código del bus).
 *   Si dos casos tuvieran el mismo nombre, se antepone el código del bus.
 * - No modifica NADA en la base (solo lectura + copia de archivos).
 *
 * Uso:  npm run export:ots
 *       npm run export:ots -- --dir "D:\respaldo\ots-junio"
 * (por defecto exporta a <proyecto>/exports/ots-preventivos)
 */

async function main() {
  const args = process.argv.slice(2);
  const dIdx = args.indexOf("--dir");
  const outDir = path.resolve(dIdx >= 0 ? args[dIdx + 1] : path.join(process.cwd(), "exports", "ots-preventivos"));
  fs.mkdirSync(outDir, { recursive: true });

  // Preventivos de junio 2026 (hora Colombia) con archivo de OT cargado.
  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const cases = await prisma.case.findMany({
    where: {
      type: CaseType.PREVENTIVO,
      OR: [
        { createdAt: { gte: desde, lt: hasta } },
        { title: { contains: "junio", mode: "insensitive" } },
      ],
      workOrder: { orderFilePath: { not: null } },
    },
    orderBy: { caseNo: "asc" },
    select: {
      caseNo: true,
      bus: { select: { code: true } },
      workOrder: { select: { orderFilePath: true, orderFileName: true } },
    },
  });

  console.log(`Preventivos de junio con OT cargada: ${cases.length}`);
  console.log(`Carpeta de destino: ${outDir}`);
  console.log("");

  let ok = 0;
  const fallidos: string[] = [];
  const usados = new Set<string>();

  for (const c of cases) {
    const relPath = c.workOrder?.orderFilePath;
    if (!relPath) continue;
    const busCode = c.bus?.code ?? "SIN_BUS";

    const bin = await readUploadBinary(relPath).catch(() => null);
    if (!bin) {
      fallidos.push(`#${c.caseNo} ${busCode} (${relPath})`);
      console.log(`  ✗ #${c.caseNo} ${busCode}: no se encontró el archivo (${relPath})`);
      continue;
    }

    let fileName = (c.workOrder?.orderFileName || bin.fileName || `${busCode}.pdf`).replace(/[\\/:*?"<>|]+/g, "_");
    if (usados.has(fileName.toLowerCase())) fileName = `${busCode}_${fileName}`;
    usados.add(fileName.toLowerCase());

    fs.writeFileSync(path.join(outDir, fileName), bin.buffer);
    ok++;
    console.log(`  ✓ #${c.caseNo} ${busCode} -> ${fileName} (${(bin.sizeBytes / 1024).toFixed(0)} KB, fuente: ${bin.source})`);
  }

  console.log("");
  console.log(`Listo: ${ok} OT descargadas en ${outDir}.`);
  if (fallidos.length) {
    console.log(`⚠️  ${fallidos.length} sin archivo recuperable:`);
    for (const f of fallidos) console.log(`   - ${f}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("La exportación falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
