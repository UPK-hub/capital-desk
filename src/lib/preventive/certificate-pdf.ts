import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PREVENTIVE_CHECKLIST,
  SEVERITY_LABEL,
  CHECK_STATE_LABEL,
  summarizeChecklist,
  type ChecklistData,
  type ChecklistItemValue,
  type ChecklistSectionDef,
  type Severity,
} from "@/lib/preventive/checklist-template";

type Col = ReturnType<typeof rgb>;

export type PreventiveCertificateInput = {
  caseNo: number | null;
  busCode: string | null;
  busPlate: string | null;
  responsableName: string | null;
  executedAt: Date | string | null;
  data: ChecklistData;
  // Nombres de las evidencias generales adjuntadas en el panel (fotos/archivos/videos).
  evidencias?: string[];
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

// Certificado de mantenimiento preventivo EN UNA SOLA HOJA (A4).
// Cabecera + ficha/resumen, checklist a dos columnas, hallazgos, evidencias
// adjuntas, recomendaciones, notas para OT y firmas.
export async function buildPreventiveCertificatePdf(input: PreventiveCertificateInput): Promise<Uint8Array> {
  const data = input.data;
  const summary = summarizeChecklist(data);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const W = 595, H = 842, M = 28, cW = W - M * 2, BOT = 44;
  const colGap = 18, colW = (cW - colGap) / 2;
  const navy = rgb(0.102, 0.122, 0.443),
    lg = rgb(0.955, 0.965, 0.98),
    bd = rgb(0.8, 0.84, 0.89),
    dark = rgb(0.13, 0.14, 0.18),
    gray = rgb(0.42, 0.45, 0.52),
    white = rgb(1, 1, 1),
    green = rgb(0.0, 0.45, 0.2),
    red = rgb(0.72, 0.1, 0.1),
    amber = rgb(0.66, 0.45, 0.0),
    blueL = rgb(0.2, 0.35, 0.6);
  const sevColor: Record<Severity, Col> = { C: red, M: amber, L: blueL };

  const capBytes = await loadLogo("CapitalBus_Logo.png");
  const upkBytes = await loadLogo("UPK_Logo.png");
  const capLogo = capBytes ? await pdf.embedPng(capBytes).catch(() => null) : null;
  const upkLogo = upkBytes ? await pdf.embedPng(upkBytes).catch(() => null) : null;

  const fecha = new Date().toLocaleString("es-CO");
  let page: PDFPage = pdf.addPage([W, H]);

  // ---- primitivas ----
  const T = (x: number, y: number, s: string, f: PDFFont, sz: number, col: Col) =>
    page.drawText(s, { x, y, size: sz, font: f, color: col });
  const RT = (xr: number, y: number, s: string, f: PDFFont, sz: number, col: Col) =>
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, sz), y, size: sz, font: f, color: col });
  const RECT = (x: number, y: number, w: number, h: number, o: { fill?: Col; stroke?: Col; sw?: number }) =>
    page.drawRectangle({ x, y, width: w, height: h, color: o.fill, borderColor: o.stroke, borderWidth: o.sw ?? (o.stroke ? 1 : 0) });
  const LINE = (x1: number, y1: number, x2: number, y2: number, col: Col, w = 0.5) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: col });
  const wrap = (s: string, f: PDFFont, sz: number, maxW: number): string[] => {
    const ws = String(s ?? "").split(/\s+/).filter(Boolean);
    const ls: string[] = [];
    let c = "";
    for (const w of ws) {
      const t = c ? `${c} ${w}` : w;
      if (f.widthOfTextAtSize(t, sz) > maxW && c) { ls.push(c); c = w; } else c = t;
    }
    if (c) ls.push(c);
    return ls.length ? ls : [""];
  };

  let y = H - M;

  // ---- cabecera ----
  const top = y;
  const logoH = 32;
  if (capLogo) {
    const w = logoH * (capLogo.width / capLogo.height);
    page.drawImage(capLogo, { x: M, y: top - logoH, width: w, height: logoH });
    if (upkLogo) {
      const uh = 24, uw = uh * (upkLogo.width / upkLogo.height);
      page.drawImage(upkLogo, { x: M + w + 18, y: top - logoH + (logoH - uh) / 2, width: uw, height: uh });
    }
  } else if (upkLogo) {
    const uh = 26, uw = uh * (upkLogo.width / upkLogo.height);
    page.drawImage(upkLogo, { x: M, y: top - uh, width: uw, height: uh });
  }
  RT(M + cW, top - 10, "CERTIFICADO DE MANTENIMIENTO", bold, 8.5, gray);
  RT(M + cW, top - 21, fecha, font, 7.5, gray);
  y = top - logoH - 8;

  const barH = 22;
  RECT(M, y - barH, cW, barH, { fill: navy });
  T(M + 12, y - 15, "CERTIFICADO DE MANTENIMIENTO PREVENTIVO", bold, 11, white);
  y -= barH + 8;

  // ---- ficha + resumen ----
  const bandH = 50;
  RECT(M, y - bandH, cW, bandH, { fill: lg, stroke: bd, sw: 1 });
  const fx = M + 12, fy = y - 13;
  const field = (x: number, yy: number, k: string, v: string) => {
    T(x, yy, k, bold, 6.5, gray);
    T(x, yy - 11, v, bold, 8.5, dark);
  };
  const busLabel = `${input.busCode ?? ""}${input.busPlate ? ` (${input.busPlate})` : ""}` || "-";
  const resultado = summary.conNovedad ? `Con novedad · ${summary.hallazgos} hallazgo(s)` : "Sin novedad";
  field(fx, fy, "CASO", `CASO-${input.caseNo ?? ""}`);
  field(fx + 95, fy, "BUS", busLabel);
  field(fx + 210, fy, "RESPONSABLE", input.responsableName ?? "-");
  field(fx, fy - 22, "FECHA EJEC.", fmtDate(input.executedAt));
  field(fx + 130, fy - 22, "RESULTADO", resultado);
  LINE(M + cW - 232, y - 8, M + cW - 232, y - bandH + 8, bd, 0.6);
  const sx = M + cW - 220;
  const stats: [string, number, Col][] = [
    ["OK", summary.okCount, green],
    ["Crít.", summary.C, red],
    ["Mod.", summary.M, amber],
    ["Leve", summary.L, blueL],
  ];
  stats.forEach(([lbl, num, col], i) => {
    const cx = sx + i * 54;
    const numTxt = lbl === "OK" ? `${num}/${summary.checkTotal}` : String(num);
    T(cx, y - 24, numTxt, bold, 13, col);
    T(cx, y - 38, lbl, font, 6.5, gray);
  });
  y -= bandH + 12;

  const bodyTop = y;
  const xL = M, xR = M + colW + colGap;

  // ---- helpers de columna ----
  const CHECK_COLOR = (estado?: string): Col => (estado === "ok" ? green : estado === "hallazgo" ? red : gray);
  const colHeader = (x: number, yy: number, title: string): number => {
    T(x, yy - 8, title.toUpperCase(), bold, 8.5, navy);
    LINE(x, yy - 11, x + colW, yy - 11, navy, 0.9);
    return yy - 20;
  };
  const colSection = (x: number, yy: number, section: ChecklistSectionDef): number => {
    yy = colHeader(x, yy, section.title);
    for (const it of section.items) {
      const v: ChecklistItemValue = data.items[section.id]?.[it.id] ?? {};
      if (it.type === "text") {
        const val = String(v.value ?? "").trim() || "—";
        T(x + 2, yy - 7.5, `${it.label}:`, font, 7.5, gray);
        T(x + 2 + font.widthOfTextAtSize(`${it.label}: `, 7.5), yy - 7.5, val, bold, 7.5, dark);
        yy -= 11;
      } else if (it.type === "voltage") {
        const val = String(v.value ?? "").trim();
        T(x + 2, yy - 7.5, it.label, font, 7.5, dark);
        RT(x + colW, yy - 7.5, val ? `${val} V` : "—", bold, 7.5, val ? dark : gray);
        yy -= 10.5;
      } else if (it.type === "photo") {
        const has = Boolean(v.photo?.filePath);
        T(x + 2, yy - 7.5, it.label, font, 7.5, dark);
        RT(x + colW, yy - 7.5, has ? "Adjunta" : "—", bold, 6.5, has ? green : gray);
        yy -= 10.5;
      } else {
        const estado = v.estado;
        const badge = (estado ? CHECK_STATE_LABEL[estado] : "—").toUpperCase();
        const col = CHECK_COLOR(estado);
        T(x + 2, yy - 7.5, it.label, font, 7.5, dark);
        RT(x + colW, yy - 7.5, badge, bold, 6.5, col);
        yy -= 10.5;
        const nota = String(v.nota ?? "").trim();
        if (nota) {
          for (const ln of wrap(nota, oblique, 6.5, colW - 14)) {
            T(x + 12, yy - 6, ln, oblique, 6.5, gray);
            yy -= 8;
          }
        }
      }
    }
    return yy - 6;
  };

  // ---- distribuir secciones en dos columnas (balance por peso) ----
  const weights = PREVENTIVE_CHECKLIST.map((s) => s.items.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const leftSecs: ChecklistSectionDef[] = [];
  const rightSecs: ChecklistSectionDef[] = [];
  let acc = 0;
  PREVENTIVE_CHECKLIST.forEach((s, i) => {
    if (leftSecs.length === 0 || acc + weights[i] / 2 <= total / 2) { leftSecs.push(s); acc += weights[i]; }
    else rightSecs.push(s);
  });
  if (rightSecs.length === 0 && leftSecs.length > 1) rightSecs.push(leftSecs.pop() as ChecklistSectionDef);

  let yL = bodyTop;
  for (const s of leftSecs) yL = colSection(xL, yL, s);
  let yR = bodyTop;
  for (const s of rightSecs) yR = colSection(xR, yR, s);

  y = Math.min(yL, yR) - 4;
  LINE(M, y, M + cW, y, bd, 0.6);
  y -= 12;

  // ---- helpers full-width ----
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < BOT) newPage(); };
  const fwHeading = (t: string) => {
    need(24);
    T(M, y - 8, t, bold, 8.5, navy);
    LINE(M, y - 11, M + cW, y - 11, navy, 0.9);
    y -= 20;
  };
  const fwPara = (t: string, sz = 8) => {
    for (const ln of wrap(t, font, sz, cW)) { need(sz + 3); T(M, y - sz, ln, font, sz, dark); y -= sz + 2.5; }
    y -= 6;
  };

  // ---- hallazgos ----
  fwHeading("HALLAZGOS");
  if (data.cierre.hallazgos.length) {
    for (const h of data.cierre.hallazgos) {
      const sev = SEVERITY_LABEL[h.severity];
      const cabeza = `${h.equipo ? h.equipo + " — " : ""}${h.descripcion || "—"}`;
      const lines = wrap(cabeza, font, 8, cW - 62);
      need(Math.max(12, lines.length * 10));
      T(M + 2, y - 8, sev, bold, 7.5, sevColor[h.severity]);
      let dy = y - 8;
      for (const ln of lines) { T(M + 60, dy, ln, font, 8, dark); dy -= 10; }
      y = Math.min(y - 11, dy);
    }
    if (data.cierre.requiereCorrectivo) {
      need(14);
      T(M + 2, y - 8, "Se generó una solicitud de mantenimiento correctivo asociada a este preventivo.", oblique, 7.5, red);
      y -= 12;
    }
  } else {
    fwPara("Sin hallazgos. El mantenimiento se ejecutó sin novedades.");
  }
  y -= 4;

  // ---- evidencias adjuntas ----
  let voltPhotos = 0, captAttached = 0, captTotal = 0;
  const captMissing: string[] = [];
  for (const s of PREVENTIVE_CHECKLIST) {
    for (const it of s.items) {
      const has = Boolean(data.items[s.id]?.[it.id]?.photo?.filePath);
      if (it.type === "voltage") { if (has) voltPhotos++; }
      else if (it.type === "photo") { captTotal++; if (has) captAttached++; else captMissing.push(it.label); }
    }
  }
  const files = (input.evidencias ?? []).filter(Boolean);
  fwHeading("EVIDENCIAS ADJUNTAS");
  const evParts: string[] = [];
  if (captTotal) {
    let s = `Capturas del checklist: ${captAttached}/${captTotal}`;
    if (captMissing.length) s += ` (faltan: ${captMissing.join(", ")})`;
    evParts.push(s);
  }
  if (voltPhotos) evParts.push(`Fotos de voltaje: ${voltPhotos}`);
  if (files.length) evParts.push(`Otros archivos: ${files.length} — ${files.join(", ")}`);
  fwPara(evParts.length ? evParts.join(". ") + "." : "Sin evidencias adjuntas en este registro.");

  // ---- recomendaciones / notas para OT de Capital ----
  if (data.cierre.recomendaciones.trim()) { fwHeading("RECOMENDACIONES"); fwPara(data.cierre.recomendaciones.trim()); }
  if (data.cierre.notasOT.trim()) { fwHeading("NOTAS PARA OT DE CAPITAL"); fwPara(data.cierre.notasOT.trim()); }

  // ---- firmas ----
  need(90);
  fwHeading("FIRMAS");
  T(M, y - 7, "Documento firmado digitalmente a través de Capital Desk; no requiere firma manuscrita.", font, 7, gray);
  y -= 20;
  const colW2 = (cW - 24) / 2;
  const blk = y;
  const sign = (x: number, nombre: string, cargo: string): number => {
    let yy = blk;
    T(x, yy, "Firmado digitalmente por", font, 7, gray); yy -= 22;
    T(x, yy, nombre || "-", oblique, 15, navy); yy -= 7;
    LINE(x, yy, x + colW2, yy, bd, 0.5); yy -= 12;
    T(x, yy, nombre || "-", bold, 8.5, dark); yy -= 11;
    T(x, yy, cargo, font, 7.5, gray); yy -= 11;
    T(x, yy, `Firma digital · Validado en Capital Desk · ${fecha}`, font, 6.5, gray);
    return yy - 8;
  };
  const s1 = sign(M, input.responsableName ?? "Por asignar", "Responsable de la ejecución");
  const s2 = sign(M + colW2 + 24, "Santiago Gil", "Coordinador STS");
  y = Math.min(s1, s2);

  // ---- pie ----
  LINE(M, 40, M + cW, 40, bd, 0.5);
  T(M, 30, "Capital Desk  ·  UPK / CapitalBus S.A.S.", font, 7.5, gray);
  RT(M + cW, 30, `Pág. ${pdf.getPageCount()}`, font, 7.5, gray);

  return pdf.save();
}
