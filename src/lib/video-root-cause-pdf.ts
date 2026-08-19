import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { DEFAULT_DOCUMENT_SIGNATURES, type DocumentSignatures } from "@/lib/document-signatures";
import { videoDownloadStatusLabels, videoOriginLabels, videoDeliveryLabels } from "@/lib/labels";
import { actionForRootCause, technicalForRootCause } from "@/lib/video-root-causes";
import fs from "node:fs/promises";
import path from "node:path";

const STATUS_LABEL = videoDownloadStatusLabels as Record<string, string>;
const ORIGIN_LABEL = videoOriginLabels as Record<string, string>;
const DELIVERY_LABEL = videoDeliveryLabels as Record<string, string>;

const STATUS_REALIZADA = "DESCARGA_REALIZADA";
const STATUS_FALLIDA = "DESCARGA_FALLIDA";

export type RootCauseReportInput = {
  caseNo: number | null;
  title: string | null;
  description: string | null;
  busCode: string | null;
  busPlate: string | null;
  requesterName: string | null;
  requesterId: string | null;
  requesterRole: string | null;
  requesterPhone: string | null;
  requesterEmail: string | null;
  origin: string | null;
  requestType: string | null;
  eventStart: Date | string | null;
  eventEnd: Date | string | null;
  deliveryMethod: string | null;
  observations: string | null;
  technicianName: string | null;
  technicianRole: string | null;
  technicianEmail: string | null;
  results: { camera: string; status: string; rootCause: string | null }[];
  corrective: { caseNo: number | null; workOrderNo: number | null } | null;
  cameraFilter?: string | null;
  // Coordinador y líder técnico que firman (configurables en /admin/firmas).
  signatures?: DocumentSignatures | null;
};

async function loadLogo(file: string): Promise<Buffer | null> {
  const candidates = [
    path.join(process.cwd(), "resources", file),
    path.join(process.cwd(), "public", "resources", file),
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p);
    } catch {
      /* siguiente */
    }
  }
  return null;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
  } catch {
    return "-";
  }
}

export async function buildRootCauseReportPdf(input: RootCauseReportInput): Promise<Uint8Array> {
  const allResults = input.results;
  const results = input.cameraFilter ? allResults.filter((r) => r.camera === input.cameraFilter) : allResults;
  const corrective = input.corrective;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const pageW = 595, pageH = 842, M = 42, cW = pageW - M * 2, BOT = 54;
  const navy = rgb(0.102, 0.122, 0.443),
    lg = rgb(0.955, 0.965, 0.98),
    bd = rgb(0.83, 0.86, 0.9),
    dark = rgb(0.13, 0.14, 0.18),
    gray = rgb(0.42, 0.45, 0.52),
    white = rgb(1, 1, 1),
    green = rgb(0.0, 0.45, 0.2),
    red = rgb(0.72, 0.1, 0.1),
    amber = rgb(0.66, 0.45, 0.0),
    redBg = rgb(0.98, 0.93, 0.93),
    redBd = rgb(0.86, 0.8, 0.8),
    blueBg = rgb(0.93, 0.95, 0.99);
  const sCol = (s: string) => (s === STATUS_REALIZADA ? green : s === STATUS_FALLIDA ? red : amber);

  const capBytes = await loadLogo("CapitalBus_Logo.png");
  const upkBytes = await loadLogo("UPK_Logo.png");
  const capLogo = capBytes ? await pdf.embedPng(capBytes).catch(() => null) : null;
  const upkLogo = upkBytes ? await pdf.embedPng(upkBytes).catch(() => null) : null;

  const fecha = new Date().toLocaleString("es-CO");
  let page: PDFPage = pdf.addPage([pageW, pageH]);
  let y = pageH - M;

  const wrap = (s: string, f: PDFFont, size: number, maxW: number): string[] => {
    const ws = String(s).split(/\s+/);
    const ls: string[] = [];
    let c = "";
    for (const w of ws) {
      const t = c ? `${c} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxW && c) {
        ls.push(c);
        c = w;
      } else c = t;
    }
    if (c) ls.push(c);
    return ls.length ? ls : [""];
  };
  const footer = () => {
    const p = pdf.getPageCount();
    page.drawLine({ start: { x: M, y: 44 }, end: { x: M + cW, y: 44 }, thickness: 0.5, color: bd });
    page.drawText("Capital Desk  ·  UPK / CapitalBus S.A.S.", { x: M, y: 32, size: 8, font, color: gray });
    page.drawText("Pág. " + p, { x: M + cW - 40, y: 32, size: 8, font, color: gray });
  };
  const newPage = () => {
    footer();
    page = pdf.addPage([pageW, pageH]);
    y = pageH - M;
  };
  const need = (h: number) => {
    if (y - h < BOT) newPage();
  };
  const heading = (t: string) => {
    need(28);
    page.drawText(t, { x: M, y: y - 2, size: 10.5, font: bold, color: navy });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: M + cW, y }, thickness: 1.2, color: navy });
    y -= 14;
  };
  const para = (t: string, o: { size?: number; gap?: number } = {}) => {
    const size = o.size ?? 9.5;
    for (const ln of wrap(t, font, size, cW)) {
      need(size + 4);
      page.drawText(ln, { x: M, y: y - size, size, font, color: dark });
      y -= size + 5;
    }
    y -= o.gap ?? 0;
  };

  // Encabezado con logos
  const top = y;
  let usedH = 0;
  if (capLogo) {
    const h = 46, w = h * (capLogo.width / capLogo.height);
    page.drawImage(capLogo, { x: M, y: top - h, width: w, height: h });
    usedH = h;
    if (upkLogo) {
      const uh = 34, uw = uh * (upkLogo.width / upkLogo.height);
      page.drawImage(upkLogo, { x: M + w + 22, y: top - h + (h - uh) / 2, width: uw, height: uh });
    }
  } else if (upkLogo) {
    const uh = 40, uw = uh * (upkLogo.width / upkLogo.height);
    page.drawImage(upkLogo, { x: M, y: top - uh, width: uw, height: uh });
    usedH = uh;
  }
  page.drawText("INFORME DE CAUSA RAÍZ", { x: M + cW - 150, y: top - 12, size: 9, font: bold, color: gray });
  page.drawText(fecha, { x: M + cW - 150, y: top - 24, size: 8, font, color: gray });
  y = top - Math.max(usedH, 28) - 14;

  const barH = 30;
  page.drawRectangle({ x: M, y: y - barH, width: cW, height: barH, color: navy });
  page.drawText("INFORME DE CAUSA RAÍZ — DESCARGA DE VIDEO", { x: M + 14, y: y - 20, size: 12, font: bold, color: white });
  y -= barH + 10;
  for (const ln of wrap(input.title ?? "", font, 10, cW)) {
    page.drawText(ln, { x: M, y: y - 2, size: 10, font, color: gray });
    y -= 14;
  }
  y -= 8;

  // Ficha de datos
  const busLabel = `${input.busCode ?? ""}${input.busPlate ? ` (${input.busPlate})` : ""}`;
  const ventana = input.eventStart || input.eventEnd ? `${fmtDate(input.eventStart)} a ${fmtDate(input.eventEnd)}` : "-";
  const fields: [string, string][] = [
    ["CASO", `CASO-${input.caseNo ?? ""}`],
    ["BUS", busLabel || "-"],
    ["SOLICITANTE", input.requesterName ?? "-"],
    ["DOCUMENTO", input.requesterId ?? "-"],
    ["CARGO", input.requesterRole ?? "-"],
    ["TELÉFONO", input.requesterPhone ?? "-"],
    ["CORREO", input.requesterEmail ?? "-"],
    ["PROCEDENCIA", input.origin ? ORIGIN_LABEL[input.origin] ?? input.origin : "-"],
    ["TIPO DE REQUERIMIENTO", input.requestType ?? "-"],
    ["MEDIO DE ENTREGA", input.deliveryMethod ? DELIVERY_LABEL[input.deliveryMethod] ?? input.deliveryMethod : "-"],
    ["VENTANA DEL EVENTO", ventana],
    ["FECHA DEL INFORME", fecha],
  ];
  const rowsN = Math.ceil(fields.length / 2), rowH = 30, boxH = rowsN * rowH + 12;
  need(boxH + 6);
  page.drawRectangle({ x: M, y: y - boxH, width: cW, height: boxH, color: lg, borderColor: bd, borderWidth: 1 });
  const colL = M + 16, colR = M + cW / 2 + 8;
  for (let i = 0; i < fields.length; i++) {
    const c = i % 2 === 0 ? colL : colR;
    const r = Math.floor(i / 2);
    const yy = y - 14 - r * rowH;
    page.drawText(fields[i][0], { x: c, y: yy, size: 7, font: bold, color: gray });
    const vLines = wrap(String(fields[i][1] || "-"), bold, 9.5, cW / 2 - 26);
    page.drawText(vLines[0], { x: c, y: yy - 13, size: 9.5, font: bold, color: dark });
  }
  y -= boxH + 16;

  // Resumen
  const tot = allResults.length,
    ok = allResults.filter((r) => r.status === STATUS_REALIZADA).length,
    fail = allResults.filter((r) => r.status === STATUS_FALLIDA).length,
    pend = tot - ok - fail;
  const stats: [string, number, any][] = [
    ["Solicitadas", tot, navy],
    ["Realizadas", ok, green],
    ["Fallidas", fail, red],
    ["Pendientes", pend, amber],
  ];
  const sH = 46;
  need(sH + 6);
  page.drawRectangle({ x: M, y: y - sH, width: cW, height: sH, color: white, borderColor: bd, borderWidth: 1 });
  const cwq = cW / 4;
  stats.forEach((s, i) => {
    const cx = M + i * cwq;
    if (i > 0) page.drawLine({ start: { x: cx, y: y - 8 }, end: { x: cx, y: y - sH + 8 }, thickness: 0.5, color: bd });
    const num = String(s[1]);
    page.drawText(num, { x: cx + cwq / 2 - bold.widthOfTextAtSize(num, 18) / 2, y: y - 26, size: 18, font: bold, color: s[2] });
    page.drawText(s[0], { x: cx + cwq / 2 - font.widthOfTextAtSize(s[0], 8) / 2, y: y - 40, size: 8, font, color: gray });
  });
  y -= sH + 18;

  // Callout correctivo
  if (corrective) {
    const cH = 34;
    need(cH + 6);
    page.drawRectangle({ x: M, y: y - cH, width: cW, height: cH, color: redBg, borderColor: redBd, borderWidth: 1 });
    page.drawRectangle({ x: M, y: y - cH, width: 5, height: cH, color: red });
    page.drawText("SOLICITUD DE MANTENIMIENTO CORRECTIVO", { x: M + 16, y: y - 14, size: 7.5, font: bold, color: rgb(0.5, 0.12, 0.12) });
    page.drawText(`N° de solicitud: CASO-${corrective.caseNo ?? ""}`, {
      x: M + 16,
      y: y - 28,
      size: 11.5,
      font: bold,
      color: dark,
    });
    y -= cH + 18;
  }

  // Descripción de la novedad
  heading("DESCRIPCIÓN DE LA NOVEDAD");
  para((input.description ?? "").trim() || "Sin descripción registrada para esta solicitud.", { gap: 10 });

  // Tabla detalle
  heading("DETALLE POR CÁMARA");
  const cols = [
    { t: "CÁMARA", w: 90 },
    { t: "ESTADO", w: 140 },
    { t: "CAUSA RAÍZ", w: cW - 90 - 140 },
  ];
  const headH = 22;
  let tTop = y, stripe = false;
  const thead = () => {
    need(headH + 24);
    tTop = y;
    page.drawRectangle({ x: M, y: y - headH, width: cW, height: headH, color: navy });
    let cx = M;
    for (const c of cols) {
      page.drawText(c.t, { x: cx + 8, y: y - 15, size: 8.5, font: bold, color: white });
      cx += c.w;
    }
    y -= headH;
    stripe = false;
  };
  const tclose = () => {
    let vx = M;
    for (let i = 0; i <= cols.length; i++) {
      page.drawLine({ start: { x: vx, y: tTop }, end: { x: vx, y }, thickness: 0.5, color: bd });
      if (i < cols.length) vx += cols[i].w;
    }
    page.drawRectangle({ x: M, y, width: cW, height: tTop - y, borderColor: bd, borderWidth: 1 });
  };
  thead();
  for (const r of results) {
    const cause = r.status === STATUS_FALLIDA && r.rootCause ? r.rootCause : "—";
    const lines = wrap(cause, font, 9, cols[2].w - 16);
    const rH = Math.max(24, 10 + lines.length * 12);
    if (y - rH < BOT) {
      tclose();
      newPage();
      thead();
    }
    if (stripe) page.drawRectangle({ x: M, y: y - rH, width: cW, height: rH, color: lg });
    let xx = M;
    page.drawText(r.camera, { x: xx + 8, y: y - 16, size: 9.5, font: bold, color: dark });
    xx += cols[0].w;
    page.drawText(STATUS_LABEL[r.status] ?? r.status, { x: xx + 8, y: y - 16, size: 9, font: bold, color: sCol(r.status) });
    xx += cols[1].w;
    let cyy = y - 16;
    for (const ln of lines) {
      page.drawText(ln, { x: xx + 8, y: cyy, size: 9, font, color: cause === "—" ? gray : dark });
      cyy -= 12;
    }
    page.drawLine({ start: { x: M, y: y - rH }, end: { x: M + cW, y: y - rH }, thickness: 0.5, color: bd });
    y -= rH;
    stripe = !stripe;
  }
  tclose();
  y -= 20;

  // Análisis técnico y plan de solución por cámara (asociado al bus)
  const failed = results.filter((r) => r.status === STATUS_FALLIDA);
  if (failed.length) {
    heading("ANÁLISIS TÉCNICO Y PLAN DE SOLUCIÓN POR CÁMARA");
    const failedNames = failed.map((r) => r.camera).join(", ");
    para(
      `En el bus ${input.busCode ?? "-"} se identificaron ${failed.length} cámara(s) con descarga fallida: ${failedNames}. La descarga fallida indica que el material de estas cámaras NO está disponible de forma definitiva para la ventana solicitada (el video no es recuperable). A continuación, el sustento técnico y la acción correctiva por cámara.`,
      { gap: 8 }
    );
    for (const r of failed) {
      const tecnico = technicalForRootCause(r.rootCause);
      const accion = actionForRootCause(r.rootCause);
      const tLines = wrap("Sustento técnico: " + tecnico, font, 9, cW - 28);
      const aLines = wrap("Acción correctiva: " + accion, font, 9, cW - 28);
      const blkH = 30 + tLines.length * 12 + 4 + aLines.length * 12 + 8;
      need(blkH + 8);
      page.drawRectangle({ x: M, y: y - blkH, width: cW, height: blkH, color: blueBg, borderColor: bd, borderWidth: 0.5 });
      page.drawRectangle({ x: M, y: y - blkH, width: 4, height: blkH, color: navy });
      page.drawText(`${r.camera}  —  ${r.rootCause ?? ""}`, { x: M + 14, y: y - 15, size: 9.5, font: bold, color: navy });
      let ay = y - 30;
      for (const ln of tLines) {
        page.drawText(ln, { x: M + 14, y: ay, size: 9, font, color: dark });
        ay -= 12;
      }
      ay -= 4;
      for (const ln of aLines) {
        page.drawText(ln, { x: M + 14, y: ay, size: 9, font, color: dark });
        ay -= 12;
      }
      y -= blkH + 8;
    }
    y -= 6;
  }

  // Conclusión
  heading("CONCLUSIÓN Y PLAN DE ACCIÓN");
  const causas = [...new Set(allResults.filter((r) => r.status === STATUS_FALLIDA && r.rootCause).map((r) => r.rootCause as string))];
  para(
    `De las ${tot} cámaras solicitadas, ${ok} se descargaron correctamente, ${fail} ${fail === 1 ? "presentó" : "presentaron"} descarga fallida y ${pend} ${pend === 1 ? "quedó pendiente" : "quedaron pendientes"} de descarga.`,
    { gap: 5 }
  );
  if (fail > 0) {
    if (causas.length) para(`Las descargas fallidas obedecen a las siguientes causas raíz: ${causas.join("; ")}.`, { gap: 5 });
    para(
      `En el bus ${input.busCode ?? "-"}, el material de las cámaras con descarga fallida no está disponible de forma definitiva para la ventana solicitada; por la naturaleza de la falla, ese video no es recuperable.`,
      { gap: 5 }
    );
    if (corrective)
      para(
        `Para corregir la causa de fondo y restablecer la grabación de cara a próximos requerimientos, se genera una solicitud de mantenimiento correctivo (N° de solicitud CASO-${corrective.caseNo ?? ""}), con la cual se ejecutarán las acciones del análisis técnico por cámara. Se notificará al solicitante el resultado de la intervención.`,
        { gap: 5 }
      );
  } else {
    para("Todas las descargas solicitadas se completaron sin novedades que requieran intervención correctiva.", { gap: 5 });
  }
  y -= 6;

  // Observaciones
  if (input.observations && input.observations.trim()) {
    heading("OBSERVACIONES DEL TÉCNICO");
    para(input.observations.trim());
  }

  // Firmas digitales
  y -= 12;
  need(160);
  heading("FIRMAS");
  para(
    "Documento firmado digitalmente a través de la mesa de ayuda Capital Desk; no requiere firma manuscrita.",
    { size: 8, gap: 20 }
  );
  const colW = (cW - 36) / 3;
  const blkTop = y;
  const drawSign = (x: number, nombre: string, cargo: string, contacto: string | null): number => {
    let yy = blkTop;
    page.drawText("Firmado digitalmente por", { x, y: yy, size: 7.5, font, color: gray });
    yy -= 26;
    // La firma (nombre en estilo manuscrito simulado).
    const nSize = (nombre || "-").length > 17 ? 12 : 15;
    page.drawText(nombre || "-", { x, y: yy, size: nSize, font: oblique, color: navy });
    yy -= 8;
    page.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 0.5, color: bd });
    yy -= 14;
    page.drawText(nombre || "-", { x, y: yy, size: 9.5, font: bold, color: dark });
    yy -= 12;
    page.drawText(cargo, { x, y: yy, size: 8, font, color: gray });
    yy -= 12;
    if (contacto) {
      page.drawText(contacto, { x, y: yy, size: 7, font, color: gray });
      yy -= 11;
    }
    page.drawText(`Firma digital · Capital Desk`, { x, y: yy, size: 7, font, color: gray });
    yy -= 9;
    page.drawText(fecha, { x, y: yy, size: 7, font, color: gray });
    yy -= 10;
    return yy;
  };
  const sy1 = drawSign(
    M,
    input.technicianName ?? "Por asignar",
    input.technicianRole ? `Técnico asignado · ${input.technicianRole}` : "Técnico asignado a la descarga",
    input.technicianEmail ?? null
  );
  const firmas = input.signatures ?? DEFAULT_DOCUMENT_SIGNATURES;
  const sy2 = drawSign(M + colW + 18, firmas.coordinadorName, firmas.coordinadorRole, null);
  const sy3 = drawSign(M + (colW + 18) * 2, firmas.liderName, firmas.liderRole, null);
  y = Math.min(sy1, sy2, sy3) - 6;

  footer();
  return pdf.save();
}
