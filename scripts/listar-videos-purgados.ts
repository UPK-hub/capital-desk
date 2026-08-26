/**
 * Exporta a Excel el listado de videos que fueron purgados del disco
 * (adjuntos de tipo VIDEO marcados como inactivos por scripts/purgar-videos.ts).
 *
 * Sirve para saber exactamente qué se eliminó y poder volver a pedirlo.
 *
 *   npm run videos:listar-purgados
 *   npm run videos:listar-purgados -- --desde 2026-08-01
 */
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { VideoAttachmentKind } from "@prisma/client";
import { resolveUploadPath } from "@/lib/uploads";

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
    { header: "¿Archivo en disco?", key: "endisco", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  let bytes = 0;
  const porMes = new Map<string, { total: number; recuperables: number; perdidos: number }>();

  for (const it of items) {
    bytes += it.size ?? 0;

    let enDisco = false;
    try {
      const st = await fs.stat(resolveUploadPath(it.filePath));
      enDisco = st.isFile();
    } catch {
      enDisco = false;
    }
    const mes = new Date(it.createdAt).toISOString().slice(0, 7);
    const acc = porMes.get(mes) ?? { total: 0, recuperables: 0, perdidos: 0 };
    acc.total += 1;
    if (enDisco) acc.recuperables += 1;
    else acc.perdidos += 1;
    porMes.set(mes, acc);

    ws.addRow({
      endisco: enDisco ? "Sí (recuperable)" : "No (borrado)",
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
  ws.autoFilter = { from: "A1", to: "Q1" };

  // ---- Hoja 2: resumen por caso, solo lo que se perdió de verdad ----
  type Res = {
    caso: string; bus: string; placa: string; titulo: string; estado: string;
    videos: number; mb: number; camaras: Set<string>; solicitante: string;
    correo: string; evento: string; ultimaCarga: string;
  };
  const porCaso = new Map<string, Res>();
  for (const it of items) {
    let enDisco = false;
    try {
      const st = await fs.stat(resolveUploadPath(it.filePath));
      enDisco = st.isFile();
    } catch {
      enDisco = false;
    }
    if (enDisco) continue; // ese sí se puede recuperar, no cuenta como perdido

    const caso = String(it.request?.case?.caseNo ?? "sin caso");
    const r = porCaso.get(caso) ?? {
      caso,
      bus: it.request?.case?.bus?.code ?? "",
      placa: it.request?.case?.bus?.plate ?? "",
      titulo: it.request?.case?.title ?? "",
      estado: String(it.request?.case?.status ?? ""),
      videos: 0,
      mb: 0,
      camaras: new Set<string>(),
      solicitante: it.request?.requesterName ?? "",
      correo: it.request?.requesterEmail ?? "",
      evento: fmt(it.request?.eventStart ?? null),
      ultimaCarga: "",
    };
    r.videos += 1;
    r.mb += (it.size ?? 0) / (1024 * 1024);
    if (it.camera) r.camaras.add(it.camera);
    r.ultimaCarga = fmt(it.createdAt);
    porCaso.set(caso, r);
  }

  const ws2 = wb.addWorksheet("Resumen por caso");
  ws2.columns = [
    { header: "Caso", key: "caso", width: 10 },
    { header: "Bus", key: "bus", width: 12 },
    { header: "Placa", key: "placa", width: 12 },
    { header: "Título del caso", key: "titulo", width: 45 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Videos perdidos", key: "videos", width: 16 },
    { header: "Tamaño (MB)", key: "mb", width: 14 },
    { header: "Cámaras", key: "camaras", width: 22 },
    { header: "Solicitante", key: "solicitante", width: 26 },
    { header: "Correo solicitante", key: "correo", width: 30 },
    { header: "Inicio del evento", key: "evento", width: 20 },
    { header: "Última carga", key: "ultima", width: 20 },
  ];
  ws2.getRow(1).font = { bold: true };
  ws2.views = [{ state: "frozen", ySplit: 1 }];
  const resumen = [...porCaso.values()].sort((a, b) => b.videos - a.videos);
  for (const r of resumen) {
    ws2.addRow({
      caso: r.caso, bus: r.bus, placa: r.placa, titulo: r.titulo, estado: r.estado,
      videos: r.videos, mb: Number(r.mb.toFixed(1)),
      camaras: [...r.camaras].join(", "), solicitante: r.solicitante, correo: r.correo,
      evento: r.evento, ultima: r.ultimaCarga,
    });
  }
  ws2.autoFilter = { from: "A1", to: "L1" };

  console.log(`\nCasos afectados (con al menos un video perdido): ${resumen.length}`);
  console.log("\nLos 15 casos con más videos perdidos:");
  for (const r of resumen.slice(0, 15)) {
    console.log(`  CASO-${r.caso.padEnd(6)} ${r.bus.padEnd(7)} ${String(r.videos).padStart(3)} videos  ${(r.mb / 1024).toFixed(1)} GB  ${r.titulo.slice(0, 45)}`);
  }

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

  console.log("\nPor mes de carga:");
  console.log("  Mes        Total   Recuperables   Borrados de verdad");
  for (const k of [...porMes.keys()].sort()) {
    const v = porMes.get(k)!;
    console.log(
      `  ${k}   ${String(v.total).padStart(5)}   ${String(v.recuperables).padStart(12)}   ${String(v.perdidos).padStart(18)}`
    );
  }

  console.log(`\nTamaño total registrado: ${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`\nArchivos generados:\n  ${outXlsx}\n  ${outCsv}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
