import { prisma } from "@/lib/prisma";
import { readUploadBinary } from "@/lib/uploads";
import { CaseType } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

/**
 * RESPALDA todo lo necesario para borrar y recrear los preventivos de JUNIO:
 *
 *   1. exports/preventivos-junio.csv  -> lista bus,fecha de TODOS los
 *      preventivos de junio (importados y del bot). Es la lista que luego
 *      usan `import:preventivos -- --csv` e `import:evidencias -- --csv`.
 *   2. exports/evidencias-junio/K####/  -> copia de las evidencias (fotos del
 *      chat) de cada caso que las tenga.
 *
 * Las OT se descargan aparte con `npm run export:ots`. Solo lectura.
 *
 * Uso:  npm run export:preventivos-junio
 */

function bogotaDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function main() {
  const outBase = path.join(process.cwd(), "exports");
  const evidDir = path.join(outBase, "evidencias-junio");
  fs.mkdirSync(evidDir, { recursive: true });

  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const cases = await prisma.case.findMany({
    where: { type: CaseType.PREVENTIVO, createdAt: { gte: desde, lt: hasta } },
    orderBy: { caseNo: "asc" },
    select: {
      id: true,
      caseNo: true,
      createdAt: true,
      bus: { select: { code: true } },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        select: { meta: true },
      },
    },
  });

  console.log(`Preventivos de junio: ${cases.length}`);

  // 1) CSV bus,fecha
  const lines = ["bus,fecha"];
  for (const c of cases) {
    const code = c.bus?.code ?? "";
    if (!code) continue;
    lines.push(`${code},${bogotaDateStr(c.createdAt)}`);
  }
  const csvPath = path.join(outBase, "preventivos-junio.csv");
  fs.writeFileSync(csvPath, lines.join("\n") + "\n", "utf8");
  console.log(`CSV escrito: ${csvPath} (${lines.length - 1} filas)`);

  // 2) Evidencias del chat
  let fotosOk = 0;
  let fotosFalta = 0;
  let casosConFotos = 0;
  for (const c of cases) {
    const code = c.bus?.code ?? "SIN_BUS";
    const withFiles = c.chatMessages
      .map((m) => (m.meta ?? {}) as any)
      .filter((meta) => typeof meta?.filePath === "string" && meta.filePath.trim());
    if (withFiles.length === 0) continue;
    casosConFotos++;

    const busDir = path.join(evidDir, code);
    fs.mkdirSync(busDir, { recursive: true });

    for (let i = 0; i < withFiles.length; i++) {
      const meta = withFiles[i];
      const bin = await readUploadBinary(String(meta.filePath)).catch(() => null);
      if (!bin) {
        fotosFalta++;
        console.log(`  ✗ ${code}: no se pudo leer ${meta.filePath}`);
        continue;
      }
      const original = String(meta.filename || bin.fileName || `foto_${i}.jpg`);
      const outName = `${String(i).padStart(2, "0")}_${safeName(original)}`;
      fs.writeFileSync(path.join(busDir, outName), bin.buffer);
      fotosOk++;
    }
  }

  console.log("");
  console.log(`Evidencias respaldadas: ${fotosOk} foto(s) de ${casosConFotos} caso(s) en ${evidDir}`);
  if (fotosFalta) console.log(`⚠️  ${fotosFalta} foto(s) no se pudieron recuperar.`);
  console.log("");
  console.log("Siguiente paso: npm run borrar:preventivos-junio  (simulacro primero)");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("El respaldo falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
