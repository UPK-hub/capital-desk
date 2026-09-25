/**
 * Importación del reporte de cámaras offline de CapitalBus.
 *
 * Convierte el archivo o el texto que manda el cliente en el material necesario
 * para crear una novedad por bus: extrae el texto (Excel, CSV, pegado o imagen
 * con OCR), lo pasa por el parser y arma el título y la descripción con el mismo
 * formato que usan las novedades creadas por el bot.
 */

import { parsearReporteCamaras, type FilaReporte } from "@/lib/novedades/camaras-offline-parser";

export const CODIGO_NOVEDAD_CAMARA = "NVD-300";
export const ORIGEN_IMPORTACION = "reporte-camaras-offline";

export type OrigenTexto = "texto" | "excel" | "csv" | "imagen";

export type ExtraccionTexto = {
  texto: string;
  origen: OrigenTexto;
  /** Advertencia para mostrar en la pantalla de revisión (p. ej. OCR). */
  aviso?: string;
};

function esExcel(nombre: string, tipo: string) {
  return /\.(xlsx|xlsm|xls)$/i.test(nombre) || /spreadsheet|excel/i.test(tipo);
}
function esCsv(nombre: string, tipo: string) {
  return /\.(csv|tsv|txt)$/i.test(nombre) || /^text\//i.test(tipo);
}
function esImagen(nombre: string, tipo: string) {
  return /\.(png|jpg|jpeg|webp|bmp|gif|tiff?)$/i.test(nombre) || /^image\//i.test(tipo);
}

/** Saca el texto plano de un archivo cargado. */
export async function extraerTextoDeArchivo(file: File): Promise<ExtraccionTexto> {
  const nombre = file.name || "";
  const tipo = file.type || "";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (esExcel(nombre, tipo)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const partes: string[] = [];
    for (const hoja of wb.SheetNames) {
      const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[hoja], {
        header: 1,
        blankrows: false,
        defval: "",
      });
      for (const fila of filas) {
        const linea = (fila as any[]).map((c) => String(c ?? "").trim()).filter(Boolean).join("\t");
        if (linea) partes.push(linea);
      }
    }
    return { texto: partes.join("\n"), origen: "excel" };
  }

  if (esCsv(nombre, tipo)) {
    return { texto: buffer.toString("utf8"), origen: "csv" };
  }

  if (esImagen(nombre, tipo)) {
    const texto = await leerImagenConOcr(buffer);
    return {
      texto,
      origen: "imagen",
      aviso:
        "El texto se leyó con OCR desde la imagen: revisa cada fila, sobre todo las IPs y los códigos de bus, antes de crear los tickets. Pegar el cuadro como texto o cargar el Excel da una lectura exacta.",
    };
  }

  throw new Error("Formato no soportado. Carga un Excel, un CSV o una imagen, o pega el cuadro como texto.");
}

/**
 * OCR de la imagen del reporte.
 *
 * tesseract.js se carga de forma perezosa: si no está instalado en el servidor,
 * la importación por texto y por Excel siguen funcionando y aquí se devuelve un
 * mensaje claro en vez de tumbar la pantalla.
 */
async function leerImagenConOcr(buffer: Buffer): Promise<string> {
  let Tesseract: any;
  try {
    Tesseract = await import("tesseract.js");
  } catch {
    throw new Error(
      "La lectura de imágenes no está disponible en este servidor (falta tesseract.js). Pega el cuadro como texto o carga el Excel."
    );
  }

  // Datos de idioma locales si están instalados (@tesseract.js-data/eng), para
  // no depender de que el servidor pueda salir al CDN cada vez.
  let langPath: string | undefined;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs");
    const candidato = path.join(
      process.cwd(),
      "node_modules",
      "@tesseract.js-data",
      "eng",
      "4.0.0_best_int"
    );
    if (fs.existsSync(path.join(candidato, "eng.traineddata.gz"))) langPath = candidato;
  } catch {
    /* sin datos locales: tesseract.js los descarga solo */
  }

  const worker = await Tesseract.createWorker("eng", 1, {
    ...(langPath ? { langPath } : {}),
    legacyCore: false,
    logger: () => undefined,
  });
  try {
    // PSM 4 = varias columnas de texto de ancho variable. Es el modo que lee bien
    // el cuadro del cliente; con el modo de bloque único se mezclan las columnas.
    await worker.setParameters({
      tessedit_pageseg_mode: "4",
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(buffer);
    return String(data?.text ?? "");
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** Analiza texto crudo (venga de donde venga) y devuelve las filas del reporte. */
export function analizarTexto(texto: string) {
  return parsearReporteCamaras(texto);
}

function listaCamaras(fila: { cameras: { name: string; ip: string | null }[] }): string {
  return fila.cameras.map((c) => `${c.name}${c.ip ? ` (${c.ip})` : ""}`).join(", ");
}

/** Título de la novedad, con el mismo estilo de los tickets ya existentes. */
export function tituloNovedad(fila: FilaReporte): string {
  const n = fila.cameras.length;
  const detalle = n === 1 ? fila.cameras[0].name : `${n} cámaras`;
  const sujeto = n === 1 ? "Cámara sin video" : "Cámaras sin video";
  return `Novedad ${fila.busCode} - ${sujeto} (imagen en negro) - ${detalle}`.slice(0, 180);
}

/** Descripción de la novedad, con el mismo formato que usa la ingesta del bot. */
export function descripcionNovedad(
  fila: FilaReporte,
  opts: { fechaReporte: string; equiposVinculados?: string[]; creador?: string | null }
): string {
  const lista = listaCamaras(fila);
  return [
    `Código novedad: ${CODIGO_NOVEDAD_CAMARA}`,
    `Equipo afectado: Cámaras — ${lista}`,
    `Novedad reportada: ${fila.cameras.length} cámara(s) fuera de línea reportadas por el cliente: ${lista}`,
    fila.busIp ? `IP del bus: ${fila.busIp}` : null,
    `Reportado por: CapitalBus · reporte de cámaras offline del ${opts.fechaReporte}`,
    opts.equiposVinculados?.length ? `Equipos vinculados: ${opts.equiposVinculados.join(", ")}` : null,
    opts.creador ? `Cargado en la mesa por: ${opts.creador}` : null,
    "Canal: importación de reporte de cámaras offline",
  ]
    .filter(Boolean)
    .join("\n");
}
