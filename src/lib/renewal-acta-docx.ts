import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

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
  origin: string;
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

function firstPhotoUrl(origin: string, list: string[] | null | undefined) {
  const first = Array.isArray(list) ? String(list[0] ?? "").trim() : "";
  if (!first) return "";
  return `${origin}/api/uploads/${first.replace(/^\/+/, "")}`;
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

export function buildRenewalPlaceholders(input: RenewalActaInput): Record<string, string> {
  const rows = Array.isArray(input.equipmentUpdates) ? input.equipmentUpdates : [];
  const map: Record<string, string> = {
    FECHA_VERIFICACION: toDateText(input.verificationDate),
    ID_BUS: valueOrBlank(input.busCode),
    PLACA_BUS: valueOrBlank(input.plate),
  };

  const entries: PlaceholderPayload[] = [
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

  for (const rowDef of entries) {
    const eq = pickEq(rows, rowDef.aliases);
    const equipmentValue = valueOrBlank(eq?.ipAddress) || valueOrBlank(eq?.type);
    map[rowDef.equipmentField] = equipmentValue;
    map[rowDef.oldSerialField] = valueOrBlank(eq?.oldSerial);
    map[rowDef.newSerialField] =
      valueOrBlank(eq?.newSerial) || valueOrBlank(eq?.serial) || valueOrBlank(rowDef.fallbackNewSerial);
    map[rowDef.oldPhotoField] = firstPhotoUrl(input.origin, eq?.photoSerialOld);
    if (rowDef.newPhotoField) {
      map[rowDef.newPhotoField] = firstPhotoUrl(input.origin, eq?.photoSerialNew);
    }
  }

  return map;
}

export async function generateRenewalActaDocxBuffer(
  templatePath: string,
  placeholders: Record<string, string>
) {
  const input = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(input);

  const xmlFiles = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml")
  );

  for (const xmlFile of xmlFiles) {
    let text = await xmlFile.async("string");
    for (const [key, rawValue] of Object.entries(placeholders)) {
      const safeValue = xmlEscape(String(rawValue ?? ""));
      text = text.split(`{{${key}}}`).join(safeValue);
    }
    text = text.replace(/\{\{[^}]+\}\}/g, "");
    zip.file(xmlFile.name, text);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

export function resolveRenewalActaTemplatePath() {
  const fromEnv = process.env.RENEWAL_ACTA_TEMPLATE_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "templates", "Formulario Reporte de Cambios.docx");
}

