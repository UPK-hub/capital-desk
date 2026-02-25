import fs from "node:fs/promises";
import path from "node:path";

export type RvrObservationCatalogItem = {
  code: string;
  result: string;
  category: string;
  reason: string;
  standardObservation: string;
  suggestedAction: string;
  nextStatus: string;
};

const FILE_CANDIDATES = [
  "Tipos de observaciones.csv",
  "tipos-de-observaciones.csv",
  "data/Tipos de observaciones.csv",
];

let cache: { signature: string; items: RvrObservationCatalogItem[] } | null = null;

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
      if (row.some((col) => col.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((col) => col.length > 0)) rows.push(row);
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }

  return rows;
}

function findHeaderIndex(headerCols: string[], requiredTokens: string[]) {
  const normalizedHeaders = headerCols.map((value) => normalizeHeader(value));
  const upperTokens = requiredTokens.map((token) => token.toUpperCase());
  return normalizedHeaders.findIndex((header) =>
    upperTokens.every((token) => header.includes(token))
  );
}

function parseCatalog(raw: string) {
  const records = parseSemicolonRows(raw);
  if (!records.length) return [] as RvrObservationCatalogItem[];

  const headers = records[0];
  const iCode = findHeaderIndex(headers, ["CODIGO", "RVR"]);
  const iResult = findHeaderIndex(headers, ["RESULTADO"]);
  const iCategory = findHeaderIndex(headers, ["CATEGORIA"]);
  const iReason = findHeaderIndex(headers, ["MOTIVO"]);
  const iObservation = findHeaderIndex(headers, ["OBSERVACION", "ESTANDAR"]);
  const iAction = findHeaderIndex(headers, ["ACCION", "SUGERIDA"]);
  const iNextStatus = findHeaderIndex(headers, ["ESTADO", "SIGUIENTE", "SUGERIDO"]);

  if (iCode < 0) return [] as RvrObservationCatalogItem[];

  const items: RvrObservationCatalogItem[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const cols = records[i];
    const code = String(cols[iCode] ?? "").trim().toUpperCase();
    if (!code) continue;
    items.push({
      code,
      result: iResult >= 0 ? String(cols[iResult] ?? "").trim() : "",
      category: iCategory >= 0 ? String(cols[iCategory] ?? "").trim() : "",
      reason: iReason >= 0 ? String(cols[iReason] ?? "").trim() : "",
      standardObservation: iObservation >= 0 ? String(cols[iObservation] ?? "").trim() : "",
      suggestedAction: iAction >= 0 ? String(cols[iAction] ?? "").trim() : "",
      nextStatus: iNextStatus >= 0 ? String(cols[iNextStatus] ?? "").trim() : "",
    });
  }

  return items;
}

async function readCatalogFile() {
  for (const relPath of FILE_CANDIDATES) {
    const fullPath = path.join(process.cwd(), relPath);
    try {
      const [raw, stat] = await Promise.all([fs.readFile(fullPath, "latin1"), fs.stat(fullPath)]);
      return { fullPath, raw, mtimeMs: stat.mtimeMs };
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function loadRvrObservationCatalog() {
  const file = await readCatalogFile();
  if (!file) return [] as RvrObservationCatalogItem[];

  const signature = `${file.fullPath}:${file.mtimeMs}`;
  if (cache && cache.signature === signature) return cache.items;

  const items = parseCatalog(file.raw);
  cache = { signature, items };
  return items;
}

export async function loadRvrObservationCatalogByCode() {
  const items = await loadRvrObservationCatalog();
  return new Map(items.map((item) => [item.code, item]));
}
