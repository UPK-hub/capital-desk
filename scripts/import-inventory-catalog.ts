import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeSerial(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function splitCsvLine(line: string) {
  return line.includes(";") ? line.split(";") : line.split(",");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePrismaError(error: unknown) {
  const code = (error as any)?.code as string | undefined;
  return code === "P2028" || code === "P1001" || code === "P1002" || code === "P1017";
}

async function upsertRowWithRetry(
  tenantId: string,
  row: { serial: string; model: string; brand: string | null },
  maxAttempts = 4
) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      await prisma.inventorySerialCatalog.upsert({
        where: {
          tenantId_serialNormalized: {
            tenantId,
            serialNormalized: row.serial,
          },
        },
        create: {
          tenantId,
          serialNormalized: row.serial,
          serialDisplay: row.serial,
          model: row.model,
          brand: row.brand,
        },
        update: {
          serialDisplay: row.serial,
          model: row.model,
          brand: row.brand,
        },
      });
      return;
    } catch (error) {
      if (!isRetryablePrismaError(error) || attempt >= maxAttempts) throw error;
      await sleep(300 * attempt);
    }
  }
}

async function main() {
  const tenantCode = (process.argv[2] || process.env.TENANT_CODE || "CAPITALBUS").trim();
  const csvArg = (process.argv[3] || process.env.INVENTORY_CSV || "Inventario.csv").trim();
  const filePath = path.isAbsolute(csvArg) ? csvArg : path.join(process.cwd(), csvArg);

  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode }, select: { id: true, code: true } });
  if (!tenant) {
    throw new Error(`Tenant no encontrado: ${tenantCode}`);
  }

  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/g)
    .map((line) => line.replace(/^\uFEFF/, "").trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error(`CSV vacío: ${filePath}`);
  }

  const parsedRows: Array<{ serial: string; model: string; brand: string | null }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const cols = splitCsvLine(line).map((c) => String(c ?? "").trim());
    if (cols.length < 2) continue;

    if (
      i === 0 &&
      /serial/i.test(cols[0] || "") &&
      /(referencia|modelo|model|reference)/i.test(cols[1] || "")
    ) {
      continue;
    }

    const serial = normalizeSerial(cols[0]);
    const model = String(cols[1] ?? "").trim();
    const brand = String(cols[2] ?? "").trim() || null;

    if (!serial) continue;
    if (!model) continue;

    parsedRows.push({ serial, model, brand });
  }

  if (!parsedRows.length) {
    throw new Error(`No se encontraron filas válidas en ${filePath}`);
  }

  const uniqueBySerial = new Map<string, { serial: string; model: string; brand: string | null }>();
  for (const row of parsedRows) {
    if (!uniqueBySerial.has(row.serial)) uniqueBySerial.set(row.serial, row);
  }

  const rows = Array.from(uniqueBySerial.values());
  const CHUNK_SIZE = 80;
  const CONCURRENCY = 8;
  let processed = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    for (let j = 0; j < chunk.length; j += CONCURRENCY) {
      const batch = chunk.slice(j, j + CONCURRENCY);
      await Promise.all(batch.map((row) => upsertRowWithRetry(tenant.id, row)));
      processed += batch.length;
    }
    console.log(`Progreso: ${processed}/${rows.length}`);
  }

  console.log(`Tenant: ${tenant.code}`);
  console.log(`Archivo: ${filePath}`);
  console.log(`Filas válidas: ${parsedRows.length}`);
  console.log(`Seriales únicos importados: ${rows.length}`);
}

main()
  .catch((error) => {
    console.error("Error importando inventario:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
