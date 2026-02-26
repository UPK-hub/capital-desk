import fs from "node:fs/promises";
import path from "node:path";

export type AffectedEquipmentType =
  | "NVR"
  | "CAMARAS"
  | "ROUTER_SIM"
  | "SWITCH_POE"
  | "GPS"
  | "CMS";

export type NovedadCatalogItem = {
  code: string;
  category: string;
  equipmentLabel: string;
  affectedEquipment: AffectedEquipmentType;
  novelty: string;
  symptoms: string;
  possibleCauses: string;
  quickCheck: string;
  minimalEvidence: string;
  impact: string;
  priorityLabel: string;
  priorityValue: number;
  interventionType: string;
  quickSolvedResponse: string;
  requiresOtResponse: string;
  standardObservation: string;
};

export type QuickCheckStep = {
  id: string;
  label: string;
};

export type QuickEvidenceRequirement = {
  id: string;
  label: string;
  required: boolean;
};

type NovedadResponseTemplates = {
  quickSolvedResponse: string;
  requiresOtResponse: string;
  standardObservation: string;
};

const CATALOG_FILE_CANDIDATES = [
  "Catalogo de novedades.csv",
  "catalogo-de-novedades.csv",
  "data/Catalogo de novedades.csv",
];

const RESPONSES_FILE_CANDIDATES = [
  "respuestas.csv",
  "Respuestas.csv",
  "data/respuestas.csv",
];

const FALLBACK_OPTIONS: Record<AffectedEquipmentType, string[]> = {
  NVR: ["NVR no enciende", "NVR sin grabacion", "NVR con falla de disco", "NVR reiniciando"],
  CAMARAS: ["Sin imagen", "Camara borrosa", "Camara con mancha", "Camara desconectada"],
  ROUTER_SIM: ["Bus no reporta", "Sin datos de comunicacion", "SIM sin servicio", "Intermitencia de enlace"],
  SWITCH_POE: ["Sin alimentacion PoE", "Puerto sin enlace", "Switch sin energia", "Switch intermitente"],
  GPS: ["Sin posicion GPS", "Posicion erratica", "GPS desconectado", "Sin actualizacion de ubicacion"],
  CMS: ["Bus no visible en CMS", "Evento no registrado en CMS", "Datos incompletos en CMS", "Sin sincronizacion CMS"],
};

let cache: { signature: string; items: NovedadCatalogItem[] } | null = null;

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeHeader(value: string) {
  return normalizeKey(value).replace(/[^A-Z0-9]+/g, " ");
}

function parseSemicolonRows(raw: string) {
  const rows: string[][] = [];
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let row: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '"') {
      const next = normalized[i + 1];
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ";" && !quoted) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if (ch === "\n" && !quoted) {
      row.push(current.trim());
      const hasAny = row.some((col) => col.length > 0);
      if (hasAny) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    const hasAny = row.some((col) => col.length > 0);
    if (hasAny) rows.push(row);
  }

  if (rows.length && rows[0].length) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }

  return rows;
}

function findHeaderIndex(headerCols: string[], requiredTokens: string[]) {
  const normalizedHeaders = headerCols.map((value) => normalizeHeader(value));
  const upperTokens = requiredTokens.map((token) => token.toUpperCase());
  return normalizedHeaders.findIndex((header) => upperTokens.every((token) => header.includes(token)));
}

function toPriorityValue(label: string) {
  const key = normalizeKey(label);
  if (key.includes("CRITICA")) return 1;
  if (key.includes("ALTA")) return 2;
  if (key.includes("MEDIA")) return 3;
  if (key.includes("BAJA")) return 4;
  return 3;
}

function mapEquipmentToType(equipmentLabel: string): AffectedEquipmentType | null {
  const key = normalizeKey(equipmentLabel);
  if (key.includes("CAMARA")) return "CAMARAS";
  if (key.includes("GPS")) return "GPS";
  if (key.includes("CMS") || key.includes("CENTRO DE GESTION")) return "CMS";
  if (key.includes("ROUTER") || key.includes("SIM")) return "ROUTER_SIM";
  if (key.includes("SWITCH") || key.includes("POE") || key.includes("CABLEADO")) return "SWITCH_POE";
  if (key.includes("NVR") || key.includes("HDD") || key.includes("GRABACION")) return "NVR";
  return null;
}

async function readCatalogFile() {
  for (const relPath of CATALOG_FILE_CANDIDATES) {
    const fullPath = path.join(process.cwd(), relPath);
    try {
      const [raw, stat] = await Promise.all([fs.readFile(fullPath, "latin1"), fs.stat(fullPath)]);
      return { fullPath, raw, mtimeMs: stat.mtimeMs };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function readResponsesFile() {
  for (const relPath of RESPONSES_FILE_CANDIDATES) {
    const fullPath = path.join(process.cwd(), relPath);
    try {
      const [raw, stat] = await Promise.all([fs.readFile(fullPath, "latin1"), fs.stat(fullPath)]);
      return { fullPath, raw, mtimeMs: stat.mtimeMs };
    } catch {
      // try next candidate
    }
  }
  return null;
}

function parseResponsesCatalog(raw: string) {
  const records = parseSemicolonRows(raw);
  if (!records.length) return new Map<string, NovedadResponseTemplates>();

  const headerCols = records[0];
  const iCode = findHeaderIndex(headerCols, ["CODIGO"]);
  const iQuickSolved = (() => {
    const exact = findHeaderIndex(headerCols, ["VR", "SOLUCIONADA"]);
    if (exact >= 0) return exact;
    return findHeaderIndex(headerCols, ["RESPUESTA", "RAPIDA", "SOLUCIONADA"]);
  })();
  const iRequiresOt = (() => {
    const exact = findHeaderIndex(headerCols, ["VR", "REVISION", "OT"]);
    if (exact >= 0) return exact;
    return findHeaderIndex(headerCols, ["REVISION", "PROFUNDA", "OT"]);
  })();
  const iObservation = (() => {
    const exact = findHeaderIndex(headerCols, ["OBSERVACION", "REPORTE", "CAPITALBUS"]);
    if (exact >= 0) return exact;
    return findHeaderIndex(headerCols, ["OBSERVACION", "ESTANDAR"]);
  })();

  if (iCode < 0) return new Map<string, NovedadResponseTemplates>();

  const byCode = new Map<string, NovedadResponseTemplates>();
  for (let i = 1; i < records.length; i += 1) {
    const cols = records[i];
    const code = String(cols[iCode] ?? "").trim();
    if (!code) continue;
    byCode.set(normalizeKey(code), {
      quickSolvedResponse: iQuickSolved >= 0 ? String(cols[iQuickSolved] ?? "").trim() : "",
      requiresOtResponse: iRequiresOt >= 0 ? String(cols[iRequiresOt] ?? "").trim() : "",
      standardObservation: iObservation >= 0 ? String(cols[iObservation] ?? "").trim() : "",
    });
  }

  return byCode;
}

function parseCatalog(raw: string, responseByCode: Map<string, NovedadResponseTemplates>) {
  const records = parseSemicolonRows(raw);
  if (!records.length) return [];

  const headerCols = records[0];
  const indexByHeader = new Map<string, number>();
  for (let i = 0; i < headerCols.length; i += 1) {
    indexByHeader.set(normalizeKey(headerCols[i]), i);
  }

  const idx = (name: string) => indexByHeader.get(normalizeKey(name)) ?? -1;

  let iCode = idx("Codigo");
  let iCategory = idx("Categoria");
  let iEquipment = idx("Equipo");
  let iNovelty = idx("Novedad");
  let iSymptoms = idx("Sintomas / Evidencia en sitio");
  let iPossibleCauses = idx("Posibles causas");
  let iQuickCheck = idx("Verificacion rapida (primeros 5 min)");
  let iMinimalEvidence = idx("Evidencia minima para ticket");
  let iImpact = idx("Impacto sugerido");
  let iPriority = idx("Prioridad");
  let iInterventionType = idx("Tipo de intervencion");

  if (iCode < 0) iCode = findHeaderIndex(headerCols, ["CODIGO"]);
  if (iCategory < 0) iCategory = findHeaderIndex(headerCols, ["CATEGORIA"]);
  if (iEquipment < 0) iEquipment = findHeaderIndex(headerCols, ["EQUIPO"]);
  if (iNovelty < 0) iNovelty = findHeaderIndex(headerCols, ["NOVEDAD"]);
  if (iSymptoms < 0) iSymptoms = findHeaderIndex(headerCols, ["SINTOMAS"]);
  if (iPossibleCauses < 0) iPossibleCauses = findHeaderIndex(headerCols, ["POSIBLES", "CAUSAS"]);
  if (iQuickCheck < 0) iQuickCheck = findHeaderIndex(headerCols, ["VERIFICACION", "RAPIDA"]);
  if (iMinimalEvidence < 0) iMinimalEvidence = findHeaderIndex(headerCols, ["EVIDENCIA", "MINIMA"]);
  if (iImpact < 0) iImpact = findHeaderIndex(headerCols, ["IMPACTO"]);
  if (iPriority < 0) iPriority = findHeaderIndex(headerCols, ["PRIORIDAD"]);
  if (iInterventionType < 0) iInterventionType = findHeaderIndex(headerCols, ["TIPO", "INTERVENCION"]);

  const parsedRows: NovedadCatalogItem[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const cols = records[i];
    const code = (iCode >= 0 ? cols[iCode] : "").trim();
    const novelty = (iNovelty >= 0 ? cols[iNovelty] : "").trim();
    const equipmentLabel = (iEquipment >= 0 ? cols[iEquipment] : "").trim();
    if (!code || !novelty || !equipmentLabel) continue;

    const affectedEquipment = mapEquipmentToType(equipmentLabel);
    if (!affectedEquipment) continue;

    const responseTemplates = responseByCode.get(normalizeKey(code));
    const priorityLabel = (iPriority >= 0 ? cols[iPriority] : "").trim() || "Media";
    parsedRows.push({
      code,
      category: (iCategory >= 0 ? cols[iCategory] : "").trim(),
      equipmentLabel,
      affectedEquipment,
      novelty,
      symptoms: (iSymptoms >= 0 ? cols[iSymptoms] : "").trim(),
      possibleCauses: (iPossibleCauses >= 0 ? cols[iPossibleCauses] : "").trim(),
      quickCheck: (iQuickCheck >= 0 ? cols[iQuickCheck] : "").trim(),
      minimalEvidence: (iMinimalEvidence >= 0 ? cols[iMinimalEvidence] : "").trim(),
      impact: (iImpact >= 0 ? cols[iImpact] : "").trim(),
      priorityLabel,
      priorityValue: toPriorityValue(priorityLabel),
      interventionType: (iInterventionType >= 0 ? cols[iInterventionType] : "").trim(),
      quickSolvedResponse: responseTemplates?.quickSolvedResponse ?? "",
      requiresOtResponse: responseTemplates?.requiresOtResponse ?? "",
      standardObservation: responseTemplates?.standardObservation ?? "",
    });
  }

  return parsedRows;
}

function fallbackCatalogItems() {
  const items: NovedadCatalogItem[] = [];
  let i = 1;
  const entries = Object.entries(FALLBACK_OPTIONS) as Array<[AffectedEquipmentType, string[]]>;
  for (const [affectedEquipment, novelties] of entries) {
    for (const novelty of novelties) {
      items.push({
        code: `NVD-FB-${String(i).padStart(3, "0")}`,
        category: "Fallback",
        equipmentLabel: affectedEquipment,
        affectedEquipment,
        novelty,
        symptoms: "",
        possibleCauses: "",
        quickCheck: "",
        minimalEvidence: "",
        impact: "",
        priorityLabel: "Media",
        priorityValue: 3,
        interventionType: "Correctivo",
        quickSolvedResponse: "",
        requiresOtResponse: "",
        standardObservation: "",
      });
      i += 1;
    }
  }
  return items;
}

function normalizeSentence(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*([,:;])\s*/g, "$1 ")
    .trim();
}

function normalizeIdSeed(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function splitCatalogText(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];

  const primaryParts = raw
    .replace(/[•·]/g, ";")
    .replace(/\s+\+\s+/g, ";")
    .replace(/\r?\n/g, ";")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  if (primaryParts.length > 1) return primaryParts;

  const commaParts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return commaParts.length > 1 ? commaParts : primaryParts;
}

const NO_EVIDENCE_PATTERNS = [/^(no\s*requiere|no\s*requerido|no\s*aplica|ninguna?)$/i, /sin\s+evidencia/i];

function hasNoEvidenceToken(value: string) {
  const normalized = normalizeSentence(value).toLowerCase();
  return NO_EVIDENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function parseQuickCheckSteps(quickCheck: string): QuickCheckStep[] {
  const parts = splitCatalogText(quickCheck);
  const unique = Array.from(new Set(parts.map((part) => normalizeSentence(part)).filter(Boolean)));

  return unique.map((label, index) => ({
    id: normalizeIdSeed(label) || `step-${index + 1}`,
    label,
  }));
}

export function parseMinimalEvidenceRequirements(minimalEvidence: string): QuickEvidenceRequirement[] {
  const parts = splitCatalogText(minimalEvidence)
    .map((part) => normalizeSentence(part))
    .filter((part) => part.length > 0 && !hasNoEvidenceToken(part));
  const unique = Array.from(new Set(parts));

  return unique.map((label, index) => ({
    id: normalizeIdSeed(label) || `evidence-${index + 1}`,
    label,
    required: true,
  }));
}

export async function loadNovedadCatalog() {
  const [catalogFile, responsesFile] = await Promise.all([readCatalogFile(), readResponsesFile()]);
  if (!catalogFile) return fallbackCatalogItems();

  const signature = `${catalogFile.fullPath}:${catalogFile.mtimeMs}|${responsesFile?.fullPath ?? ""}:${responsesFile?.mtimeMs ?? 0}`;
  if (cache && cache.signature === signature) {
    return cache.items;
  }

  const responseByCode = responsesFile
    ? parseResponsesCatalog(responsesFile.raw)
    : new Map<string, NovedadResponseTemplates>();
  const parsed = parseCatalog(catalogFile.raw, responseByCode);
  const items = parsed.length ? parsed : fallbackCatalogItems();
  cache = { signature, items };
  return items;
}

export function priorityValueToOption(priorityValue: number): "BAJA" | "MEDIA" | "ALTA" {
  if (priorityValue <= 2) return "ALTA";
  if (priorityValue >= 4) return "BAJA";
  return "MEDIA";
}

const novedadCatalogUtils = {
  loadNovedadCatalog,
  priorityValueToOption,
  parseQuickCheckSteps,
  parseMinimalEvidenceRequirements,
};

export default novedadCatalogUtils;
