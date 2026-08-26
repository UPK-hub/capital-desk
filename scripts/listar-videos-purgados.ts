/**
 * Exporta a Excel el listado de videos que fueron purgados del disco
 * (adjuntos de tipo VIDEO marcados como inactivos por scripts/purgar-videos.ts).
 *
 * Sirve para saber exactamente qué se eliminó y poder volver a pedirlo.
 *
 *   npm run videos:listar-purgados
 *   npm run videos:listar-purgados -- --desde 2026-08-01
 */
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { VideoAttachmentKind } from "@prisma/client";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "";

async function main() {
  const desdeRaw = arg("--desde");
  const desde = desdeRaw ? new Date(`${desdeRaw}T00:00:00.000Z`) : null;

  const items = await prisma.videoAttachment.findMany({
    where: {
      kind: VideoAttachmentKind.VIDEO,
      active: false,
      ...(desde ? { createdAt: { gte: desde } } : {}),
    },
    select: {
      originalName: true,
      filePath: true,
      camera: true,
      size: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
      request: {
        select: {
          requesterName: true,
          requesterEmail: true,
          eventStart: true,
          eventEnd: true,
          camerasRequested: true,
          deliveryMethod: true,
          case: { select: { caseNo: true, title: true, status: true, bus: { select: { code: true, plate: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Videos eliminados encontrados: ${items.length}`);
  if (!items.length) {
    await prisma.$disconnect();
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Videos eliminados");
  ws.columns = [
    { header: "Caso", key: "caso", width: 10 },
    { header: "Bus", key: "bus", width: 12 },
    { header: "Placa", key: "placa", width: 12 },
    { header: "Título del caso", key: "titulo", width: 45 },
    { header: "Estado del caso", key: "estado", width: 16 },
    { header: "Cámara", key: "camara", width: 14 },
    { header: "Archivo", key: "archivo", width: 55 },
    { header: "Tamaño (MB)", key: "mb", width: 14 },
    { header: "Cargado el", key: "cargado", width: 20 },
    { header: "Cargado por", key: "por", width: 24 },
    { header: "Inicio del evento", key: "ini", width: 20 },
    { header: "Fin del evento", key: "fin", width: 20 },
    { header: "Solicitante", key: "solicitante", width: 26 },
    { header: "Correo solicitante", key: "correo", width: 30 },
    { header: "Cámaras solicitadas", key: "camaras", width: 22 },
    { header: "Entrega", key: "entrega", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  let bytes = 0;
  for (const it of items) {
    bytes += it.size ?? 0;
    ws.addRow({
      caso: it.request?.case?.caseNo ?? "",
      bus: it.request?.case?.bus?.code ?? "",
      placa: it.request?.case?.bus?.plate ?? "",
      titulo: it.request?.case?.title ?? "",
      estado: it.request?.case?.status ?? "",
      camara: it.camera ?? "",
      archivo: it.originalName || path.basename(it.filePath),
      mb: it.size ? Number((it.size / (1024 * 1024)).toFixed(1)) : "",
      cargado: fmt(it.createdAt),
      por: it.uploadedBy?.name ?? "",
      ini: fmt(it.request?.eventStart ?? null),
      fin: fmt(it.request?.eventEnd ?? null),
      solicitante: it.request?.requesterName ?? "",
      correo: it.request?.requesterEmail ?? "",
      camaras: it.request?.camerasRequested ?? "",
      entrega: it.request?.deliveryMethod ?? "",
    });
  }
  ws.autoFilter = { from: "A1", to: "P1" };

  const hoy = new Date().toISOString().slice(0, 10);
  const dir = path.join(process.cwd(), "exports");
  const fs = await import("node:fs/promises");
  await fs.mkdir(dir, { recursive: true });

  const outXlsx = path.join(dir, `videos_eliminados_${hoy}.xlsx`);
  await wb.xlsx.writeFile(outXlsx);

  // CSV de respaldo: abre en cualquier Excel y no se daña al copiarlo.
  // Separador ";" y BOM para que Excel en español respete columnas y tildes.
  const esc = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas: string[] = [];
  ws.eachRow((row) => {
    const vals = (row.values as any[]).slice(1).map(esc);
    lineas.push(vals.join(";"));
  });
  const outCsv = path.join(dir, `videos_eliminados_${hoy}.csv`);
  await fs.writeFile(outCsv, "\uFEFF" + lineas.join("\r\n"), "utf8");

  console.log(`Tamaño total registrado: ${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`\nArchivos generados:\n  ${outXlsx}\n  ${outCsv}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
