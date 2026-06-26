/**
 * Adjunta las fotos de evidencia del lote PREVENTIVO del 2026-06-23 a la tarjeta
 * "Evidencias y adjuntos" de cada caso. Resuelve el caso por BUS + fecha (23/jun),
 * NO por número de caso. Autor = Anderson Rueda. Idempotente (importBatch).
 *
 * Carpeta esperada: una subcarpeta por bus (K1416/, K1436/, ...). Pásala con --dir.
 * (K1443 se IGNORA: no está en el lote.)
 *   npx tsx scripts/import-evidencias-23jun.ts --dir "D:\\ruta\\preventivos"
 *   npx tsx scripts/import-evidencias-23jun.ts --dir "D:\\ruta\\preventivos" --apply
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { CaseType } from "@prisma/client";
import { saveGeneratedUpload } from "@/lib/uploads";

const IMPORT_BATCH = "evidencias-preventivo-23jun";
const FECHA = "2026-06-23";
const BUSES = ["K1416","K1436","K1444","K1446","K1447","K1448","K1449","K1450","K1453","K1455","K1456","K1458","K1459","K1466","K1467"];

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif", ".bmp"]);
function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  if (e === ".bmp") return "image/bmp";
  if (e === ".heic") return "image/heic";
  if (e === ".heif") return "image/heif";
  return "application/octet-stream";
}
function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, "_"); }
function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const senderEmail = (arg("--sender") || "anderson.rueda@upk.local").toLowerCase();
  const dir = path.resolve(arg("--dir") || "");

  console.log(`\n=== Evidencias preventivo 23/jun ===`);
  console.log(`Modo:    ${apply ? "APLICAR (escribe en BD/disco)" : "PRUEBA (no toca nada)"}`);
  console.log(`Carpeta: ${dir || "(falta --dir)"}\n`);

  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`✗ No existe la carpeta. Pásala con --dir "ruta" (la que tiene K1416/, K1436/, ...).`);
    process.exit(1);
  }

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error("✗ No se encontró el tenant."); process.exit(1); }
  const tenantId = tenant.id;

  let sender = await prisma.user.findFirst({ where: { tenantId, email: senderEmail } });
  if (!sender) sender = await prisma.user.findFirst({ where: { tenantId, name: { contains: "Anderson", mode: "insensitive" } } });
  if (!sender) { console.error(`✗ No se encontró el autor (${senderEmail} ni "Anderson").`); process.exit(1); }
  console.log(`Autor: ${sender.name} <${sender.email}>\n`);

  const folderByLower = new Map<string, string>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) folderByLower.set(entry.name.toLowerCase(), entry.name);
  }

  const dayStart = new Date(`${FECHA}T00:00:00-05:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const baseAt = new Date(`${FECHA}T12:00:00-05:00`);

  let totalFiles = 0, totalCreated = 0, totalSkipped = 0;
  const sinCarpeta: string[] = [], sinCaso: string[] = [], ok: string[] = [];

  for (const bus of BUSES) {
    const busRow = await prisma.bus.findFirst({ where: { tenantId, code: bus }, select: { id: true } });
    if (!busRow) { sinCaso.push(`${bus} (bus no existe)`); continue; }

    const kase = await prisma.case.findFirst({
      where: { tenantId, busId: busRow.id, type: CaseType.PREVENTIVO, createdAt: { gte: dayStart, lt: dayEnd } },
      select: { id: true, caseNo: true },
    });
    if (!kase) { sinCaso.push(`${bus} (no hay preventivo del 23/jun — ¿ya creaste los casos?)`); continue; }

    const folderName = folderByLower.get(bus.toLowerCase());
    if (!folderName) { sinCarpeta.push(`${bus} (sin carpeta)`); continue; }

    const busDir = path.join(dir, folderName);
    const files = fs.readdirSync(busDir, { withFileTypes: true })
      .filter((f) => f.isFile() && IMAGE_EXTS.has(path.extname(f.name).toLowerCase()))
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b, "es"));
    if (files.length === 0) { sinCarpeta.push(`${bus} (carpeta vacía)`); continue; }

    const existing = await prisma.caseChatMessage.findMany({ where: { tenantId, caseId: kase.id }, select: { meta: true } });
    const yaCargadas = new Set<string>();
    for (const m of existing) {
      const meta = (m.meta ?? {}) as any;
      if (meta?.importBatch === IMPORT_BATCH && meta?.filename) yaCargadas.add(String(meta.filename));
    }

    let creadas = 0, saltadas = 0;
    for (let i = 0; i < files.length; i++) {
      const original = files[i];
      totalFiles++;
      if (yaCargadas.has(original)) { saltadas++; totalSkipped++; continue; }

      const ext = path.extname(original);
      const mime = mimeFromExt(ext);
      const buffer = fs.readFileSync(path.join(busDir, original));
      const size = buffer.length;
      const createdAt = new Date(baseAt.getTime() + i * 1000);
      const relPath = `case-chat/${kase.id}/${IMPORT_BATCH}_${String(i).padStart(2, "0")}_${safeName(original)}`;

      if (apply) {
        await saveGeneratedUpload(relPath, buffer, { originalName: original, mimeType: mime });
        await prisma.caseChatMessage.create({
          data: {
            tenantId, caseId: kase.id, senderId: sender.id, message: "[Imagen]", createdAt,
            meta: { filePath: relPath, filename: original, mime, size, kind: "image", importBatch: IMPORT_BATCH, source: "import-evidencia-23jun" },
          },
        });
      }
      creadas++; totalCreated++;
    }
    ok.push(`${bus} (caso #${kase.caseNo}): ${creadas} ${apply ? "creadas" : "a crear"}${saltadas ? `, ${saltadas} ya estaban` : ""}`);
  }

  console.log(`--- Procesados (${ok.length}) ---`);
  for (const l of ok) console.log("  ✔ " + l);
  if (sinCaso.length) { console.log(`\n--- Sin caso (${sinCaso.length}) ---`); for (const s of sinCaso) console.log("  • " + s); }
  if (sinCarpeta.length) { console.log(`\n--- Sin carpeta/fotos (${sinCarpeta.length}) ---`); for (const s of sinCarpeta) console.log("  • " + s); }

  console.log(`\n=== Totales ===`);
  console.log(`  Fotos vistas: ${totalFiles}  ·  ${apply ? "creadas" : "a crear"}: ${totalCreated}  ·  ya estaban: ${totalSkipped}`);
  if (!apply) console.log(`\n(PRUEBA: no se escribió nada. Agrega --apply para adjuntar.)`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error("✗ Falló:", err); await prisma.$disconnect(); process.exit(1); });
