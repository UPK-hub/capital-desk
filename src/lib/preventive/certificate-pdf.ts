import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PREVENTIVE_CHECKLIST,
  SEVERITY_LABEL,
  CHECK_STATE_LABEL,
  summarizeChecklist,
  type ChecklistData,
  type Severity,
} from "@/lib/preventive/checklist-template";

export type PreventiveCertificateInput = {
  caseNo: number | null;
  busCode: string | null;
  busPlate: string | null;
  responsableName: string | null;
  executedAt: Date | string | null;
  data: ChecklistData;
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
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short" }).format(new Date(d));
  } catch {
    return "-";
  }
}

export async function buildPreventiveCertificatePdf(input: PreventiveCertificateInput): Promise<Uint8Array> {
  const data = input.data;
  const summary = summarizeChecklist(data);

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
    amber = rgb(0.66, 0.45, 0.0);
  const sevColor: Record<Severity, ReturnType<typeof rgb>> = { C: red, M: amber, L: rgb(0.2, 0.35, 0.6) };

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
  page.drawText("CERTIFICADO DE MANTENIMIENTO", { x: M + cW - 175, y: top - 12, size: 9, font: bold, color: gray });
  page.drawText(fecha, { x: M + cW - 175, y: top - 24, size: 8, font, color: gray });
  y = top - Math.max(usedH, 28) - 14;

  const barH = 30;
  page.drawRectangle({ x: M, y: y - barH, width: cW, height: barH, color: navy });
  page.drawText("CERTIFICADO DE MANTENIMIENTO PREVENTIVO", { x: M + 14, y: y - 20, size: 12, font: bold, color: white });
  y -= barH + 12;

  // Ficha de datos
  const busLabel = `${input.busCode ?? ""}${input.busPlate ? ` (${input.busPlate})` : ""}`;
  const resultado = summary.conNovedad
    ? `Con novedad · ${summary.hallazgos} hallazgo(s)`
    : "Sin novedad";
  const fields: [string, string][] = [
    ["CASO", `CASO-${input.caseNo ?? ""}`],
    ["BUS", busLabel || "-"],
    ["RESPONSABLE (EJECUTÓ)", input.responsableName ?? "-"],
    ["FECHA DE EJECUCIÓN", fmtDate(input.executedAt)],
    ["RESULTADO", resultado],
    ["FECHA DEL CERTIFICADO", fecha],
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

  // Resumen (stats)
  const stats: [string, number, ReturnType<typeof rgb>][] = [
    [`Ítems OK`, summary.okCount, green],
    ["Críticos", summary.C, red],
    ["Moderados", summary.M, amber],
    ["Leves", summary.L, rgb(0.2, 0.35, 0.6)],
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

  // Secciones del checklist
  for (const section of PREVENTIVE_CHECKLIST) {
    const sectionItems = section.items;
    heading(section.title.toUpperCase());

    if (section.id === "electrico") {
      // Tabla de voltajes: PUNTO | VOLTAJE
      const cols = [
        { t: "PUNTO DE MEDICIÓN", w: cW - 150 },
        { t: "VOLTAJE", w: 150 },
      ];
      const headH = 20;
      let tTop = y, stripe = false;
      const thead = () => {
        need(headH + 22);
        tTop = y;
        page.drawRectangle({ x: M, y: y - headH, width: cW, height: headH, color: navy });
        let cx = M;
        for (const c of cols) {
          page.drawText(c.t, { x: cx + 8, y: y - 14, size: 8, font: bold, color: white });
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
      for (const it of sectionItems) {
        const val = data.items[section.id]?.[it.id]?.value?.trim() || "—";
        const hasPhoto = Boolean(data.items[section.id]?.[it.id]?.photo);
        const rH = 20;
        if (y - rH < BOT) {
          tclose();
          newPage();
          thead();
        }
        if (stripe) page.drawRectangle({ x: M, y: y - rH, width: cW, height: rH, color: lg });
        page.drawText(it.label, { x: M + 8, y: y - 14, size: 9, font, color: dark });
        const valTxt = val === "—" ? "—" : `${val} V${hasPhoto ? "   (con foto)" : ""}`;
        page.drawText(valTxt, { x: M + cols[0].w + 8, y: y - 14, size: 9, font: bold, color: val === "—" ? gray : dark });
        page.drawLine({ start: { x: M, y: y - rH }, end: { x: M + cW, y: y - rH }, thickness: 0.5, color: bd });
        y -= rH;
        stripe = !stripe;
      }
      tclose();
      y -= 16;
      continue;
    }

    // Secciones tipo texto (identificación) o check
    for (const it of sectionItems) {
      const v = data.items[section.id]?.[it.id] ?? {};
      if (it.type === "text") {
        const val = String(v.value ?? "").trim() || "—";
        need(16);
        page.drawText(`${it.label}:`, { x: M + 4, y: y - 11, size: 9, font, color: gray });
        page.drawText(val, { x: M + 4 + font.widthOfTextAtSize(`${it.label}: `, 9) + 4, y: y - 11, size: 9, font: bold, color: dark });
        y -= 16;
      } else {
        // check
        const estado = v.estado;
        const label = estado ? CHECK_STATE_LABEL[estado] : "Sin marcar";
        const col = estado === "ok" ? green : estado === "hallazgo" ? red : gray;
        const nota = String(v.nota ?? "").trim();
        const notaLines = nota ? wrap(nota, font, 8.5, cW - 220) : [];
        const rH = Math.max(16, 6 + Math.max(1, notaLines.length) * 11);
        need(rH);
        // bullet
        page.drawCircle({ x: M + 6, y: y - 8, size: 2.2, color: col });
        page.drawText(it.label, { x: M + 16, y: y - 11, size: 9, font, color: dark });
        page.drawText(label.toUpperCase(), { x: M + cW - 190, y: y - 11, size: 8, font: bold, color: col });
        if (notaLines.length) {
          let ny = y - 11;
          for (const ln of notaLines) {
            page.drawText(ln, { x: M + cW - 130, y: ny, size: 8.5, font: oblique, color: gray });
            ny -= 11;
          }
        }
        y -= rH;
      }
    }
    y -= 12;
  }

  // Hallazgos de cierre
  heading("HALLAZGOS");
  if (data.cierre.hallazgos.length) {
    const cols = [
      { t: "SEV.", w: 70 },
      { t: "EQUIPO", w: 150 },
      { t: "DESCRIPCIÓN", w: cW - 70 - 150 },
    ];
    const headH = 20;
    let tTop = y, stripe = false;
    const thead = () => {
      need(headH + 24);
      tTop = y;
      page.drawRectangle({ x: M, y: y - headH, width: cW, height: headH, color: navy });
      let cx = M;
      for (const c of cols) {
        page.drawText(c.t, { x: cx + 8, y: y - 14, size: 8, font: bold, color: white });
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
    for (const h of data.cierre.hallazgos) {
      const desc = wrap(h.descripcion || "—", font, 9, cols[2].w - 16);
      const rH = Math.max(22, 8 + desc.length * 12);
      if (y - rH < BOT) {
        tclose();
        newPage();
        thead();
      }
      if (stripe) page.drawRectangle({ x: M, y: y - rH, width: cW, height: rH, color: lg });
      page.drawText(SEVERITY_LABEL[h.severity], { x: M + 8, y: y - 15, size: 8.5, font: bold, color: sevColor[h.severity] });
      const eqLines = wrap(h.equipo || "—", font, 8.5, cols[1].w - 12);
      page.drawText(eqLines[0], { x: M + cols[0].w + 8, y: y - 15, size: 8.5, font, color: dark });
      let dy = y - 15;
      for (const ln of desc) {
        page.drawText(ln, { x: M + cols[0].w + cols[1].w + 8, y: dy, size: 9, font, color: dark });
        dy -= 12;
      }
      page.drawLine({ start: { x: M, y: y - rH }, end: { x: M + cW, y: y - rH }, thickness: 0.5, color: bd });
      y -= rH;
      stripe = !stripe;
    }
    tclose();
    y -= 8;
    if (data.cierre.requiereCorrectivo) {
      need(20);
      page.drawText("Se generó una solicitud de mantenimiento correctivo asociada a este preventivo.", {
        x: M,
        y: y - 11,
        size: 9,
        font: oblique,
        color: red,
      });
      y -= 18;
    }
  } else {
    para("No se registraron hallazgos. El mantenimiento se ejecutó sin novedades.", { gap: 6 });
  }
  y -= 6;

  // Recomendaciones y observaciones
  if (data.cierre.recomendaciones.trim()) {
    heading("RECOMENDACIONES");
    para(data.cierre.recomendaciones.trim(), { gap: 6 });
  }
  if (data.cierre.observaciones.trim()) {
    heading("OBSERVACIONES");
    para(data.cierre.observaciones.trim(), { gap: 6 });
  }

  // Firmas
  y -= 12;
  need(150);
  heading("FIRMAS");
  para("Documento firmado digitalmente a través de la mesa de ayuda Capital Desk; no requiere firma manuscrita.", {
    size: 8,
    gap: 20,
  });
  const colW = (cW - 24) / 2;
  const blkTop = y;
  const drawSign = (x: number, nombre: string, cargo: string): number => {
    let yy = blkTop;
    page.drawText("Firmado digitalmente por", { x, y: yy, size: 7.5, font, color: gray });
    yy -= 26;
    page.drawText(nombre || "-", { x, y: yy, size: 17, font: oblique, color: navy });
    yy -= 8;
    page.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 0.5, color: bd });
    yy -= 14;
    page.drawText(nombre || "-", { x, y: yy, size: 9.5, font: bold, color: dark });
    yy -= 12;
    page.drawText(cargo, { x, y: yy, size: 8.5, font, color: gray });
    yy -= 12;
    page.drawText(`Firma digital · Validado en Capital Desk · ${fecha}`, { x, y: yy, size: 7, font, color: gray });
    yy -= 10;
    return yy;
  };
  const sy1 = drawSign(M, input.responsableName ?? "Por asignar", "Responsable de la ejecución");
  const sy2 = drawSign(M + colW + 24, "Santiago Gil", "Coordinador STS");
  y = Math.min(sy1, sy2) - 6;

  footer();
  return pdf.save();
}
