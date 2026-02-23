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

const CATALOG_FILE_CANDIDATES = [
  "Catalogo de novedades.csv",
  "catalogo-de-novedades.csv",
  "data/Catalogo de novedades.csv",
];

const FALLBACK_OPTIONS: Record<AffectedEquipmentType, string[]> = {
  NVR: ["NVR no enciende", "NVR sin grabacion", "NVR con falla de disco", "NVR reiniciando"],
  CAMARAS: ["Sin imagen", "Camara borrosa", "Camara con mancha", "Camara desconectada"],
  ROUTER_SIM: ["Bus no reporta", "Sin datos de comunicacion", "SIM sin servicio", "Intermitencia de enlace"],
  SWITCH_POE: ["Sin alimentacion PoE", "Puerto sin enlace", "Switch sin energia", "Switch intermitente"],
  GPS: ["Sin posicion GPS", "Posicion erratica", "GPS desconectado", "Sin actualizacion de ubicacion"],
  CMS: ["Bus no visible en CMS", "Evento no registrado en CMS", "Datos incompletos en CMS", "Sin sincronizacion CMS"],
};

let cache: { key: string; mtimeMs: number; items: NovedadCatalogItem[] } | null = null;

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseSemicolonLine(line: string) {
  const cols: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ";" && !quoted) {
      cols.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  cols.push(current.trim());
  return cols;
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

function parseCatalog(raw: string) {
  const lines = raw
    .split(/\r?\n/g)
    .map((line) => line.replace(/^\uFEFF/, "").trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headerCols = parseSemicolonLine(lines[0]);
  const indexByHeader = new Map<string, number>();
  for (let i = 0; i < headerCols.length; i += 1) {
    indexByHeader.set(normalizeKey(headerCols[i]), i);
  }

  const idx = (name: string) => indexByHeader.get(normalizeKey(name)) ?? -1;

  const iCode = idx("Codigo");
  const iCategory = idx("Categoria");
  const iEquipment = idx("Equipo");
  const iNovelty = idx("Novedad");
  const iSymptoms = idx("Sintomas / Evidencia en sitio");
  const iPossibleCauses = idx("Posibles causas");
  const iQuickCheck = idx("Verificacion rapida (primeros 5 min)");
  const iMinimalEvidence = idx("Evidencia minima para ticket");
  const iImpact = idx("Impacto sugerido");
  const iPriority = idx("Prioridad");
  const iInterventionType = idx("Tipo de intervencion");

  const rows: NovedadCatalogItem[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseSemicolonLine(lines[i]);
    const code = (iCode >= 0 ? cols[iCode] : "").trim();
    const novelty = (iNovelty >= 0 ? cols[iNovelty] : "").trim();
    const equipmentLabel = (iEquipment >= 0 ? cols[iEquipment] : "").trim();
    if (!code || !novelty || !equipmentLabel) continue;

    const affectedEquipment = mapEquipmentToType(equipmentLabel);
    if (!affectedEquipment) continue;

    const priorityLabel = (iPriority >= 0 ? cols[iPriority] : "").trim() || "Media";
    rows.push({
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
    });
  }

  return rows;
}

function fallbackCatalogItems() {
  const rows: NovedadCatalogItem[] = [];
  let i = 1;
  const entries = Object.entries(FALLBACK_OPTIONS) as Array<[AffectedEquipmentType, string[]]>;
  for (const [affectedEquipment, novelties] of entries) {
    for (const novelty of novelties) {
      rows.push({
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
      });
      i += 1;
    }
  }
  return rows;
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

const NO_EVIDENCE_PATTERNS = [
  /^(no\s*requiere|no\s*requerido|no\s*aplica|ninguna?)$/i,
  /sin\s+evidencia/i,
];

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
  const file = await readCatalogFile();
  if (!file) return fallbackCatalogItems();

  if (cache && cache.key === file.fullPath && cache.mtimeMs === file.mtimeMs) {
    return cache.items;
  }

  const parsed = parseCatalog(file.raw);
  const items = parsed.length ? parsed : fallbackCatalogItems();
  cache = { key: file.fullPath, mtimeMs: file.mtimeMs, items };
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
