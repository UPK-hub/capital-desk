import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { resolveUploadPath } from "@/lib/uploads";

type RenewalEqRow = {
  type?: string | null;
  ipAddress?: string | null;
  oldSerial?: string | null;
  newSerial?: string | null;
  serial?: string | null;
  photoSerialOld?: string[] | null;
  photoSerialNew?: string[] | null;
};

type RenewalActaInput = {
  origin?: string;
  busCode: string;
  plate: string | null;
  verificationDate: string | Date | null;
  equipmentUpdates: RenewalEqRow[];
};

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeType(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function toDateText(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeStoredUploadPath(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const marker = "/api/uploads/";

  const markerIdx = raw.indexOf(marker);
  if (markerIdx >= 0) {
    return raw.slice(markerIdx + marker.length).replace(/^\/+/, "");
  }

  try {
    const u = new URL(raw);
    const pathname = String(u.pathname ?? "");
    const idx = pathname.indexOf(marker);
    if (idx >= 0) return pathname.slice(idx + marker.length).replace(/^\/+/, "");
    return pathname.replace(/^\/+/, "");
  } catch {
    return raw.replace(/^\/+/, "");
  }
}

function firstPhotoPath(list: string[] | null | undefined) {
  const first = Array.isArray(list) ? String(list[0] ?? "").trim() : "";
  return normalizeStoredUploadPath(first);
}

function pickEq(rows: RenewalEqRow[], aliases: string[]) {
  const aliasSet = new Set(aliases.map((a) => normalizeType(a)));
  return rows.find((r) => aliasSet.has(normalizeType(r.type)));
}

type PlaceholderPayload = {
  equipmentField: string;
  oldSerialField: string;
  newSerialField: string;
  oldPhotoField: string;
  newPhotoField?: string;
  aliases: string[];
  fallbackNewSerial?: string;
};

function valueOrBlank(v: unknown) {
  const s = String(v ?? "").trim();
  return s;
}

const EQUIPMENT_FIELDS: PlaceholderPayload[] = [
  {
    equipmentField: "CAMARA_CONDUCTOR_BO",
    oldSerialField: "SERIAL_DESINSTALADO_BO",
    newSerialField: "SERIAL_INSTALADO_BO",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_BO",
    newPhotoField: "FOTO_SERIAL_INSTALADO_BO",
    aliases: ["BO", "CAMARA_CONDUCTOR_BO"],
  },
  {
    equipmentField: "CAMARA_DELANTERA_BF",
    oldSerialField: "SERIAL_DESINSTALADO_BF",
    newSerialField: "SERIAL_INSTALADO_BF",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_BF",
    newPhotoField: "FOTO_SERIAL_INSTALADO_BF",
    aliases: ["BF", "BFE", "CAMARA_DELANTERA_BF"],
  },
  {
    equipmentField: "CAMARA_B1_1",
    oldSerialField: "SERIAL_DESINSTALADO_B1_1",
    newSerialField: "SERIAL_INSTALADO_B1_1",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B1_1",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B1_1",
    aliases: ["BV1_1", "CAMARA_B1_1"],
  },
  {
    equipmentField: "CAMARA_B1_2",
    oldSerialField: "SERIAL_DESINSTALADO_B1_2",
    newSerialField: "SERIAL_INSTALADO_B1_2",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B1_2",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B1_2",
    aliases: ["BV1_2", "CAMARA_B1_2"],
  },
  {
    equipmentField: "CAMARA_B1_3",
    oldSerialField: "SERIAL_DESINSTALADO_B1_3",
    newSerialField: "SERIAL_INSTALADO_B1_3",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B1_3",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B1_3",
    aliases: ["BV1_3", "CAMARA_B1_3"],
  },
  {
    equipmentField: "CAMARA_B1_4",
    oldSerialField: "SERIAL_DESINSTALADO_B1_4",
    newSerialField: "SERIAL_INSTALADO_B1_4",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B1_4",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B1_4",
    aliases: ["BV1_4", "CAMARA_B1_4"],
  },
  {
    equipmentField: "CAMARA_B2_1",
    oldSerialField: "SERIAL_DESINSTALADO_B2_1",
    newSerialField: "SERIAL_INSTALADO_B2_1",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B2_1",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B2_1",
    aliases: ["BV2_1", "CAMARA_B2_1"],
  },
  {
    equipmentField: "CAMARA_B2_2",
    oldSerialField: "SERIAL_DESINSTALADO_B2_2",
    newSerialField: "SERIAL_INSTALADO_B2_2",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B2_2",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B2_2",
    aliases: ["BV2_2", "CAMARA_B2_2"],
  },
  {
    equipmentField: "CAMARA_B3_1",
    oldSerialField: "SERIAL_DESINSTALADO_B3_1",
    newSerialField: "SERIAL_INSTALADO_B3_1",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B3_1",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B3_1",
    aliases: ["BV3_1", "CAMARA_B3_1"],
  },
  {
    equipmentField: "CAMARA_B3_2",
    oldSerialField: "SERIAL_DESINSTALADO_B3_2",
    newSerialField: "SERIAL_INSTALADO_B3_2",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B3_2",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B3_2",
    aliases: ["BV3_2", "CAMARA_B3_2"],
  },
  {
    equipmentField: "CAMARA_B3_3",
    oldSerialField: "SERIAL_DESINSTALADO_B3_3",
    newSerialField: "SERIAL_INSTALADO_B3_3",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B3_3",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B3_3",
    aliases: ["BV3_3", "CAMARA_B3_3"],
  },
  {
    equipmentField: "CAMARA_B3_4",
    oldSerialField: "SERIAL_DESINSTALADO_B3_4",
    newSerialField: "SERIAL_INSTALADO_B3_4",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_B3_4",
    newPhotoField: "FOTO_SERIAL_INSTALADO_B3_4",
    aliases: ["BV3_4", "CAMARA_B3_4"],
  },
  {
    equipmentField: "CAMARA_TRASERA_BT",
    oldSerialField: "SERIAL_DESINSTALADO_BT",
    newSerialField: "SERIAL_INSTALADO_BT",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_BT",
    newPhotoField: "FOTO_SERIAL_INSTALADO_BT",
    aliases: ["BT", "BTE", "CAMARA_TRASERA_BT"],
  },
  {
    equipmentField: "GRABADOR_NVR",
    oldSerialField: "SERIAL_DESINSTALADO_NVR",
    newSerialField: "SERIAL_INSTALADO_NVR",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_NVR",
    newPhotoField: "FOTO_SERIAL_INSTALADO_NVR",
    aliases: ["NVR", "GRABADOR_NVR"],
  },
  {
    equipmentField: "COLECTOR_DATOS",
    oldSerialField: "SERIAL_DESINSTALADO_CO",
    newSerialField: "SERIAL_INSTALADO_CO",
    oldPhotoField: "FOTO_SERIAL_DESINSTALADO_CO",
    aliases: ["COLECTOR_DATOS", "COLECTOR"],
    fallbackNewSerial: "NO APLICA",
  },
];

export type RenewalActaPlaceholders = {
  textPlaceholders: Record<string, string>;
  imagePlaceholders: Record<string, string>;
  selectedEquipmentFields: string[];
};

export function buildRenewalPlaceholders(input: RenewalActaInput): RenewalActaPlaceholders {
  const rows = Array.isArray(input.equipmentUpdates) ? input.equipmentUpdates : [];
  const textPlaceholders: Record<string, string> = {
    FECHA_VERIFICACION: toDateText(input.verificationDate),
    ID_BUS: valueOrBlank(input.busCode),
    PLACA_BUS: valueOrBlank(input.plate),
  };
  const imagePlaceholders: Record<string, string> = {};
  const selectedEquipmentFields = new Set<string>();

  for (const rowDef of EQUIPMENT_FIELDS) {
    const eq = pickEq(rows, rowDef.aliases);
    if (eq) selectedEquipmentFields.add(rowDef.equipmentField);

    const equipmentValue = valueOrBlank(eq?.ipAddress) || valueOrBlank(eq?.type);
    textPlaceholders[rowDef.equipmentField] = equipmentValue;
    textPlaceholders[rowDef.oldSerialField] = valueOrBlank(eq?.oldSerial);
    textPlaceholders[rowDef.newSerialField] =
      valueOrBlank(eq?.newSerial) || valueOrBlank(eq?.serial) || valueOrBlank(rowDef.fallbackNewSerial);
    textPlaceholders[rowDef.oldPhotoField] = "";
    const oldPhotoPath = firstPhotoPath(eq?.photoSerialOld);
    if (oldPhotoPath) imagePlaceholders[rowDef.oldPhotoField] = oldPhotoPath;
    if (rowDef.newPhotoField) {
      textPlaceholders[rowDef.newPhotoField] = "";
      const newPhotoPath = firstPhotoPath(eq?.photoSerialNew);
      if (newPhotoPath) imagePlaceholders[rowDef.newPhotoField] = newPhotoPath;
    }
  }

  return {
    textPlaceholders,
    imagePlaceholders,
    selectedEquipmentFields: [...selectedEquipmentFields],
  };
}

export async function generateRenewalActaDocxBuffer(
  templatePath: string,
  placeholders: RenewalActaPlaceholders
) {
  const input = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(input);
  let documentXml = await zip.file("word/document.xml")?.async("string");
  let relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  let contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

  if (!documentXml || !relsXml || !contentTypesXml) {
    throw new Error("Plantilla DOCX incompleta");
  }

  const selectedEquipment = new Set(placeholders.selectedEquipmentFields ?? []);
  if (selectedEquipment.size > 0 && selectedEquipment.size < EQUIPMENT_FIELDS.length) {
    for (const row of EQUIPMENT_FIELDS) {
      if (!selectedEquipment.has(row.equipmentField)) {
        documentXml = removeTableByPlaceholder(documentXml, row.equipmentField);
      }
    }
  }

  const imageFields = Object.keys(placeholders.imagePlaceholders ?? {});
  const usedRels = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  let nextRid = (usedRels.length ? Math.max(...usedRels) : 0) + 1;
  let imageCount = 0;

  for (const field of imageFields) {
    const relPath = placeholders.imagePlaceholders[field];
    const absPath = resolveUploadPath(relPath);
    let fileBuffer: Buffer | null = null;
    try {
      fileBuffer = await fs.readFile(absPath);
    } catch {
      fileBuffer = null;
    }
    if (!fileBuffer) {
      documentXml = replaceToken(documentXml, field, "");
      continue;
    }

    const ext = normalizeImageExt(path.extname(absPath));
    const contentType = IMAGE_CONTENT_TYPE_BY_EXT[ext];
    if (!contentType) {
      documentXml = replaceToken(documentXml, field, "");
      continue;
    }

    const imageName = `renewal_image_${String(++imageCount).padStart(3, "0")}.${ext}`;
    const imageTarget = `media/${imageName}`;
    zip.file(`word/${imageTarget}`, fileBuffer);

    const rid = `rId${nextRid++}`;
    relsXml = addImageRelationship(relsXml, rid, imageTarget);
    contentTypesXml = ensureImageContentType(contentTypesXml, ext, contentType);
    const { cx, cy } = calcTargetSizeEmu(fileBuffer, ext);

    const drawing = makeDrawingXml({
      rid,
      name: imageName,
      docPrId: 1000 + imageCount,
      cx,
      cy,
    });

    documentXml = replaceTokenWithDrawing(documentXml, field, drawing);
  }

  for (const [key, rawValue] of Object.entries(placeholders.textPlaceholders ?? {})) {
    const safeValue = xmlEscape(String(rawValue ?? ""));
    documentXml = documentXml.split(`{{${key}}}`).join(safeValue);
  }
  documentXml = documentXml.replace(/\{\{[^}]+\}\}/g, "");

  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  zip.file("[Content_Types].xml", contentTypesXml);

  return zip.generateAsync({ type: "nodebuffer" });
}

function removeTableByPlaceholder(documentXml: string, placeholder: string) {
  const token = `{{${placeholder}}}`;
  let out = documentXml;
  let idx = out.indexOf(token);
  while (idx >= 0) {
    const range = findContainingTableRange(out, idx);
    if (!range) break;
    out = out.slice(0, range.start) + out.slice(range.end);
    idx = out.indexOf(token);
  }
  return out;
}

function findContainingTableRange(xml: string, tokenIndex: number) {
  const tableTag = /<w:tbl(?=[\s>])|<\/w:tbl>/g;
  const stack: number[] = [];
  let m: RegExpExecArray | null = null;

  while ((m = tableTag.exec(xml))) {
    const idx = Number(m.index ?? -1);
    if (idx < 0) continue;
    if (idx > tokenIndex) break;
    if (m[0].startsWith("</")) {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(idx);
    }
  }

  const start = stack.length ? stack[stack.length - 1] : -1;
  if (start < 0) return null;

  tableTag.lastIndex = start;
  let depth = 0;
  while ((m = tableTag.exec(xml))) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        const end = Number(m.index ?? -1) + "</w:tbl>".length;
        if (end > tokenIndex) return { start, end };
        return null;
      }
    } else {
      depth += 1;
    }
  }
  return null;
}

function replaceToken(documentXml: string, placeholder: string, value: string) {
  return documentXml.split(`{{${placeholder}}}`).join(value);
}

function replaceTokenWithDrawing(documentXml: string, placeholder: string, drawingXml: string) {
  const token = `{{${placeholder}}}`;
  let out = documentXml;
  let idx = out.indexOf(token);
  while (idx >= 0) {
    const runStart = findLastRunStart(out, idx);
    const runEndTag = out.indexOf("</w:r>", idx);
    if (runStart < 0 || runEndTag < 0) {
      out = replaceToken(out, placeholder, "");
      break;
    }
    const runEnd = runEndTag + "</w:r>".length;
    const runXml = out.slice(runStart, runEnd);
    if (!runXml.includes(token)) {
      out = out.slice(0, idx) + out.slice(idx + token.length);
      idx = out.indexOf(token);
      continue;
    }
    out = out.slice(0, runStart) + drawingXml + out.slice(runEnd);
    idx = out.indexOf(token);
  }
  return out;
}

function findLastRunStart(xml: string, beforeIndex: number) {
  const re = /<w:r(?=[\s>])/g;
  let start = -1;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(xml))) {
    const idx = Number(m.index ?? -1);
    if (idx < 0) continue;
    if (idx > beforeIndex) break;
    start = idx;
  }
  return start;
}

const IMAGE_CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function normalizeImageExt(extWithDot: string) {
  return extWithDot.replace(/^\./, "").toLowerCase();
}

function addImageRelationship(relsXml: string, rid: string, imageTarget: string) {
  const relTag =
    `<Relationship Id="${rid}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="${imageTarget}"/>`;
  return relsXml.replace("</Relationships>", `${relTag}</Relationships>`);
}

function ensureImageContentType(contentTypesXml: string, ext: string, contentType: string) {
  const marker = `Extension="${ext}"`;
  if (contentTypesXml.includes(marker)) return contentTypesXml;
  const defaultTag = `<Default Extension="${ext}" ContentType="${contentType}"/>`;
  return contentTypesXml.replace("</Types>", `${defaultTag}</Types>`);
}

function makeDrawingXml(input: {
  rid: string;
  name: string;
  docPrId: number;
  cx: number;
  cy: number;
}) {
  const { rid, name, docPrId, cx, cy } = input;
  return (
    `<w:r>` +
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPrId}" name="${xmlEscape(name)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic>` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic>` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="0" name="${xmlEscape(name)}"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${rid}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>` +
    `</w:r>`
  );
}

type ImagePx = { width: number; height: number };

function cmToEmu(cm: number) {
  return Math.round((cm / 2.54) * 914400);
}

function toUInt16LE(buf: Buffer, offset: number) {
  return buf[offset] | (buf[offset + 1] << 8);
}

function toUInt16BE(buf: Buffer, offset: number) {
  return (buf[offset] << 8) | buf[offset + 1];
}

function toUInt32BE(buf: Buffer, offset: number) {
  return (buf[offset] * 2 ** 24) + (buf[offset + 1] << 16) + (buf[offset + 2] << 8) + buf[offset + 3];
}

function readPngDimensions(buf: Buffer): ImagePx | null {
  if (buf.length < 24) return null;
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (!isPng) return null;
  const width = toUInt32BE(buf, 16);
  const height = toUInt32BE(buf, 20);
  if (!width || !height) return null;
  return { width, height };
}

function readGifDimensions(buf: Buffer): ImagePx | null {
  if (buf.length < 10) return null;
  const header = buf.toString("ascii", 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const width = toUInt16LE(buf, 6);
  const height = toUInt16LE(buf, 8);
  if (!width || !height) return null;
  return { width, height };
}

function readJpegDimensions(buf: Buffer): ImagePx | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;

    const length = toUInt16BE(buf, i + 2);
    if (length < 2 || i + 2 + length > buf.length) break;

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof && i + 8 < buf.length) {
      const height = toUInt16BE(buf, i + 5);
      const width = toUInt16BE(buf, i + 7);
      if (width && height) return { width, height };
      return null;
    }

    i += 2 + length;
  }
  return null;
}

function readImageDimensions(buf: Buffer, ext: string): ImagePx | null {
  if (ext === "png") return readPngDimensions(buf);
  if (ext === "jpg" || ext === "jpeg") return readJpegDimensions(buf);
  if (ext === "gif") return readGifDimensions(buf);
  return null;
}

function calcTargetSizeEmu(buf: Buffer, ext: string) {
  const targetCy = cmToEmu(6);
  const px = readImageDimensions(buf, ext);
  if (!px || !px.width || !px.height) {
    return { cx: Math.round(targetCy * (4 / 3)), cy: targetCy };
  }
  const ratio = px.width / px.height;
  return { cx: Math.max(1, Math.round(targetCy * ratio)), cy: targetCy };
}

export function resolveRenewalActaTemplatePath() {
  const fromEnv = process.env.RENEWAL_ACTA_TEMPLATE_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "templates", "Formulario Reporte de Cambios.docx");
}
