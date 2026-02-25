import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ParsedCsvRow = {
  line: number;
  serial: string;
  busCode: string;
  location: string;
};

type Action = {
  busId: string;
  busCode: string;
  busEquipmentId: string;
  equipmentType: string;
  fromSerial: string | null;
  toSerial: string;
  sourceRows: number[];
};

type BaselineCapture = {
  busId: string;
  busCode: string;
  busEquipmentId: string;
  equipmentType: string;
  currentSerial: string;
  baselineSerial: string;
  sourceRows: number[];
};

const TENANT_DEFAULT = "CAPITALBUS";
const FILE_DEFAULT = "Inventario_CB.csv";
const PAIR_TYPES = new Set(["Baterias", "Discos Duros"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePrismaError(error: unknown) {
  const code = (error as any)?.code as string | undefined;
  return code === "P2028" || code === "P1001" || code === "P1002" || code === "P1017";
}

async function withRetry<T>(task: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await task();
    } catch (error) {
      if (!isRetryablePrismaError(error) || attempt >= maxAttempts) throw error;
      await sleep(300 * attempt);
    }
  }
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values];
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function pickExisting(typeByKey: Map<string, string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const hit = typeByKey.get(normalizeKey(candidate));
    if (hit) return hit;
  }
  return null;
}

function argValue(name: string): string | null {
  const withEq = process.argv.find((x) => x.startsWith(`${name}=`));
  if (withEq) return withEq.slice(name.length + 1).trim();
  const idx = process.argv.findIndex((x) => x === name);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]).trim();
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function normalizeText(v: unknown) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .trim();
}

function normalizeKey(v: unknown) {
  return normalizeText(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSerialCompare(v: unknown) {
  return normalizeText(v)
    .toUpperCase()
    .replace(/\s+/g, "");
}

function splitSemicolon(line: string): string[] {
  return line.split(";").map((x) => normalizeText(x));
}

function mapLocationToEquipmentType(
  rawLocation: string,
  typeByKey: Map<string, string>
): { type: string | null; mappedBy: string } {
  const raw = normalizeText(rawLocation);
  const upperCompact = raw.toUpperCase().replace(/\s+/g, "");
  const key = normalizeKey(raw);

  const existingExact = typeByKey.get(key);
  if (existingExact) return { type: existingExact, mappedBy: "existing-type" };

  if (/^BV[123]_[1234]$/.test(upperCompact)) {
    const match = pickExisting(typeByKey, [upperCompact]);
    return { type: match, mappedBy: match ? "direct" : "unmapped" };
  }
  if (/^BV[123][1234]$/.test(upperCompact)) {
    const fixed = `${upperCompact.slice(0, 3)}_${upperCompact.slice(3)}`;
    const match = pickExisting(typeByKey, [fixed]);
    return { type: match, mappedBy: match ? "direct-normalized" : "unmapped" };
  }
  if (upperCompact === "BO" || upperCompact === "BFE" || upperCompact === "BTE" || upperCompact === "NVR") {
    const match = pickExisting(typeByKey, [upperCompact]);
    return { type: match, mappedBy: match ? "direct" : "unmapped" };
  }

  switch (key) {
    case "baterias":
    case "bateria":
      return { type: pickExisting(typeByKey, ["Baterias"]), mappedBy: "alias" };
    case "discosduros":
    case "discoduro":
      return { type: pickExisting(typeByKey, ["Discos Duros"]), mappedBy: "alias" };
    case "switch":
      return { type: pickExisting(typeByKey, ["Switch", "Modulo 4G/5G"]), mappedBy: "alias-switch" };
    case "controladordecarga":
      return {
        type: pickExisting(typeByKey, ["Controlador de carga", "Tarjeta de Energía"]),
        mappedBy: "alias-energia-controlador",
      };
    case "tarjetadeenergia":
      return {
        type: pickExisting(typeByKey, ["Tarjeta de Energía", "Controlador de carga"]),
        mappedBy: "alias-energia-tarjeta",
      };
    case "gabinetedeequipos":
      return { type: pickExisting(typeByKey, ["Gabinete de equipos"]), mappedBy: "alias-gabinete" };
    case "colector":
      return { type: pickExisting(typeByKey, ["Colector"]), mappedBy: "alias-colector" };
    case "modulo4g5g":
    case "modulo4g":
      return { type: pickExisting(typeByKey, ["Modulo 4G/5G"]), mappedBy: "direct-normalized" };
    default:
      return { type: null, mappedBy: "unmapped" };
  }
}

function readCsvRows(filePath: string): Promise<ParsedCsvRow[]> {
  return fs.readFile(filePath, "latin1").then((raw) => {
    const lines = raw
      .split(/\r?\n/g)
      .map((l) => l.replace(/^\uFEFF/, ""))
      .filter((l) => normalizeText(l).length > 0);

    if (!lines.length) return [];

    const header = splitSemicolon(lines[0]);
    const keyToIndex = new Map<string, number>();
    header.forEach((h, idx) => keyToIndex.set(normalizeKey(h), idx));

    const serialIdx = keyToIndex.get("serial");
    const busIdx = keyToIndex.get("bus");
    const locationIdx = keyToIndex.get("ubicacion") ?? keyToIndex.get("ubicacin");

    if (serialIdx === undefined || busIdx === undefined || locationIdx === undefined) {
      throw new Error(
        `Encabezado inválido. Se esperaban columnas Serial, Bus, Ubicación. Header actual: ${header.join(" | ")}`
      );
    }

    const rows: ParsedCsvRow[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = splitSemicolon(lines[i]);
      const serial = normalizeText(cols[serialIdx]);
      const busCode = normalizeText(cols[busIdx]).toUpperCase();
      const location = normalizeText(cols[locationIdx]);

      if (!serial || !busCode || !location) continue;
      rows.push({ line: i + 1, serial, busCode, location });
    }
    return rows;
  });
}

function uniqueSerials(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = normalizeText(value);
    const key = normalizeSerialCompare(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function makePairSerial(serials: string[]): string {
  return serials.map((s) => normalizeText(s)).filter(Boolean).join(" / ");
}

async function main() {
  const tenantCode = (argValue("--tenant") || process.env.TENANT_CODE || TENANT_DEFAULT).trim();
  const fileArg = (argValue("--file") || process.env.INVENTARIO_CB_CSV || FILE_DEFAULT).trim();
  const apply = hasFlag("--apply");
  const verbose = hasFlag("--verbose");
  const overrideExisting = hasFlag("--override-existing");
  const concurrency = Math.max(1, Number(argValue("--concurrency") || process.env.IMPORT_CONCURRENCY || "8"));
  const eventChunkSize = Math.max(1, Number(argValue("--event-chunk-size") || "250"));
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);

  const tenant = await prisma.tenant.findUnique({
    where: { code: tenantCode },
    select: { id: true, code: true },
  });
  if (!tenant) throw new Error(`Tenant no encontrado: ${tenantCode}`);

  const equipmentTypes = await prisma.equipmentType.findMany({
    select: { name: true },
  });
  const typeByKey = new Map<string, string>();
  for (const t of equipmentTypes) {
    typeByKey.set(normalizeKey(t.name), t.name);
  }

  const rows = await readCsvRows(filePath);
  if (!rows.length) throw new Error(`Sin filas válidas en ${filePath}`);

  const grouped = new Map<
    string,
    Map<string, { serials: string[]; lineNumbers: number[]; rawLocations: Set<string>; mappedBy: Set<string> }>
  >();
  const unmappedByBus = new Map<string, Array<{ location: string; serial: string; line: number }>>();

  for (const row of rows) {
    const mapped = mapLocationToEquipmentType(row.location, typeByKey);
    if (!mapped.type) {
      const list = unmappedByBus.get(row.busCode) ?? [];
      list.push({ location: row.location, serial: row.serial, line: row.line });
      unmappedByBus.set(row.busCode, list);
      continue;
    }

    const byType = grouped.get(row.busCode) ?? new Map();
    const current = byType.get(mapped.type) ?? {
      serials: [],
      lineNumbers: [],
      rawLocations: new Set<string>(),
      mappedBy: new Set<string>(),
    };
    current.serials.push(row.serial);
    current.lineNumbers.push(row.line);
    current.rawLocations.add(row.location);
    current.mappedBy.add(mapped.mappedBy);
    byType.set(mapped.type, current);
    grouped.set(row.busCode, byType);
  }

  const busCodes = Array.from(grouped.keys());
  const buses = await prisma.bus.findMany({
    where: { tenantId: tenant.id, code: { in: busCodes } },
    select: {
      id: true,
      code: true,
      equipments: {
        select: {
          id: true,
          serial: true,
          active: true,
          equipmentType: { select: { name: true } },
        },
      },
    },
  });

  const busByCode = new Map(buses.map((b) => [b.code.toUpperCase(), b]));
  const actions: Action[] = [];
  const baselineCaptures: BaselineCapture[] = [];
  const issues: string[] = [];
  const counters = {
    totalRows: rows.length,
    groupedBuses: grouped.size,
    busNotFound: 0,
    equipmentNotFound: 0,
    conflicts: 0,
    unchanged: 0,
    preservedExisting: 0,
    baselineCaptured: 0,
    updates: 0,
    unmappedRows: Array.from(unmappedByBus.values()).reduce((acc, x) => acc + x.length, 0),
  };

  for (const [busCode, byType] of grouped.entries()) {
    const bus = busByCode.get(busCode);
    if (!bus) {
      counters.busNotFound += 1;
      issues.push(`Bus no encontrado: ${busCode}`);
      continue;
    }

    const equipmentByType = new Map<string, Array<(typeof bus.equipments)[number]>>();
    for (const eq of bus.equipments) {
      const k = normalizeKey(eq.equipmentType.name);
      const list = equipmentByType.get(k) ?? [];
      list.push(eq);
      equipmentByType.set(k, list);
    }

    for (const [equipmentTypeName, payload] of byType.entries()) {
      const candidates = equipmentByType.get(normalizeKey(equipmentTypeName)) ?? [];
      if (!candidates.length) {
        counters.equipmentNotFound += 1;
        issues.push(`Bus ${busCode}: equipo no encontrado para tipo "${equipmentTypeName}"`);
        continue;
      }

      const activeCandidates = candidates.filter((x) => x.active);
      const chosen = (activeCandidates.length ? activeCandidates : candidates)[0];
      if (!chosen) continue;
      if (activeCandidates.length > 1) {
        counters.conflicts += 1;
        issues.push(`Bus ${busCode}: múltiples equipos activos para tipo "${equipmentTypeName}", se omite.`);
        continue;
      }

      const serials = uniqueSerials(payload.serials);
      if (!serials.length) continue;

      let nextSerial: string | null = null;
      if (PAIR_TYPES.has(equipmentTypeName)) {
        if (serials.length > 2) {
          counters.conflicts += 1;
          issues.push(`Bus ${busCode}: "${equipmentTypeName}" tiene ${serials.length} seriales, se omite.`);
          continue;
        }
        if (serials.length < 2) {
          counters.conflicts += 1;
          issues.push(
            `Bus ${busCode}: "${equipmentTypeName}" llegó incompleto (${serials.length} serial), se conserva actual.`
          );
          continue;
        }
        nextSerial = makePairSerial(serials);
      } else {
        if (serials.length > 1) {
          counters.conflicts += 1;
          issues.push(`Bus ${busCode}: "${equipmentTypeName}" con seriales duplicados, se omite para no dañar datos.`);
          continue;
        }
        nextSerial = serials[0];
      }

      const current = normalizeText(chosen.serial);
      const currentKey = normalizeSerialCompare(current);
      const nextKey = normalizeSerialCompare(nextSerial);
      if (currentKey === nextKey) {
        counters.unchanged += 1;
        continue;
      }
      if (current && !overrideExisting) {
        counters.preservedExisting += 1;
        baselineCaptures.push({
          busId: bus.id,
          busCode: bus.code,
          busEquipmentId: chosen.id,
          equipmentType: equipmentTypeName,
          currentSerial: current,
          baselineSerial: nextSerial,
          sourceRows: payload.lineNumbers.slice(0, 20),
        });
        continue;
      }

      actions.push({
        busId: bus.id,
        busCode: bus.code,
        busEquipmentId: chosen.id,
        equipmentType: equipmentTypeName,
        fromSerial: current || null,
        toSerial: nextSerial,
        sourceRows: payload.lineNumbers.slice(0, 20),
      });
    }
  }

  counters.updates = actions.length;

  console.log("=== Inventario CB: pre-validación ===");
  console.log(`Tenant: ${tenant.code}`);
  console.log(`Archivo: ${filePath}`);
  console.log(`Filas válidas: ${counters.totalRows}`);
  console.log(`Buses en CSV: ${counters.groupedBuses}`);
  console.log(`Filas no mapeadas (ubicación fuera de catálogo): ${counters.unmappedRows}`);
  console.log(`Buses no encontrados: ${counters.busNotFound}`);
  console.log(`Equipos no encontrados en DB: ${counters.equipmentNotFound}`);
  console.log(`Conflictos protegidos (omitidos): ${counters.conflicts}`);
  console.log(`Sin cambio: ${counters.unchanged}`);
  console.log(`Serial existente preservado (sin override): ${counters.preservedExisting}`);
  console.log(`Baseline previo capturado en historial: ${baselineCaptures.length}`);
  console.log(`Cambios aplicables: ${counters.updates}`);
  console.log(`Modo overwrite: ${overrideExisting ? "ACTIVO (--override-existing)" : "NO (seguro)"}`);

  if (issues.length) {
    console.log("\n--- Muestras de incidencias ---");
    for (const line of issues.slice(0, 25)) console.log(`- ${line}`);
  }

  if (!apply) {
    console.log("\nModo simulación (dry-run). No se aplicaron cambios.");
    console.log("Ejecuta con --apply para aplicar:");
    console.log(`npm run import:inventario_cb -- --tenant=${tenant.code} --file=\"${fileArg}\" --apply`);
    return;
  }

  let applied = 0;
  let applyFailures = 0;
  let baselineFailures = 0;
  let unmappedFailures = 0;
  const failureSamples: string[] = [];

  for (let i = 0; i < actions.length; i += concurrency) {
    const batch = actions.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((action) =>
        withRetry(() =>
          prisma.$transaction([
            prisma.busEquipment.update({
              where: { id: action.busEquipmentId },
              data: { serial: action.toSerial },
            }),
            prisma.busLifecycleEvent.create({
              data: {
                busId: action.busId,
                busEquipmentId: action.busEquipmentId,
                eventType: "BUS_INVENTORY_BASELINE_SYNC",
                summary: `[INVENTARIO_CB] ${action.equipmentType}: ${action.fromSerial ?? "Sin serial"} -> ${action.toSerial}`,
              },
            }),
          ])
        )
      )
    );

    settled.forEach((result, idx) => {
      const action = batch[idx];
      if (result.status === "fulfilled") {
        applied += 1;
      } else {
        applyFailures += 1;
        if (failureSamples.length < 20) {
          failureSamples.push(
            `[APPLY][${action.busCode}][${action.equipmentType}] ${String((result.reason as any)?.message || result.reason)}`
          );
        }
      }
    });

    if (verbose) {
      console.log(`Aplicados: ${applied}/${actions.length} (fallidos: ${applyFailures})`);
    }
  }

  const baselineEvents = baselineCaptures.map((capture) => ({
    busId: capture.busId,
    busEquipmentId: capture.busEquipmentId,
    eventType: "BUS_INVENTORY_BASELINE_CAPTURED",
    summary: `[INVENTARIO_CB][BASELINE] ${capture.equipmentType}: base=${capture.baselineSerial} | actual=${capture.currentSerial}`,
  }));
  for (const eventChunk of chunkArray(baselineEvents, eventChunkSize)) {
    try {
      await withRetry(() => prisma.busLifecycleEvent.createMany({ data: eventChunk }));
      counters.baselineCaptured += eventChunk.length;
    } catch (error) {
      for (const event of eventChunk) {
        try {
          await withRetry(() => prisma.busLifecycleEvent.create({ data: event }));
          counters.baselineCaptured += 1;
        } catch (singleError) {
          baselineFailures += 1;
          if (failureSamples.length < 20) {
            failureSamples.push(
              `[BASELINE][${event.busId}] ${String((singleError as any)?.message || singleError)}`
            );
          }
        }
      }
    }
  }

  const unmappedEvents: Array<{ busId: string; eventType: string; summary: string }> = [];
  for (const [busCode, extras] of unmappedByBus.entries()) {
    const bus = busByCode.get(busCode);
    if (!bus || !extras.length) continue;
    for (const item of extras) {
      unmappedEvents.push({
        busId: bus.id,
        eventType: "BUS_INVENTORY_UNMAPPED_CAPTURED",
        summary: `[INVENTARIO_CB][UNMAPPED] ${item.location}: ${item.serial}`,
      });
    }
  }

  for (const eventChunk of chunkArray(unmappedEvents, eventChunkSize)) {
    try {
      await withRetry(() => prisma.busLifecycleEvent.createMany({ data: eventChunk }));
    } catch (error) {
      for (const event of eventChunk) {
        try {
          await withRetry(() => prisma.busLifecycleEvent.create({ data: event }));
        } catch (singleError) {
          unmappedFailures += 1;
          if (failureSamples.length < 20) {
            failureSamples.push(
              `[UNMAPPED][${event.busId}] ${String((singleError as any)?.message || singleError)}`
            );
          }
        }
      }
    }
  }

  console.log("\n=== Resultado aplicado ===");
  console.log(`Cambios de serial aplicados: ${applied}`);
  console.log(`Cambios de serial fallidos: ${applyFailures}`);
  console.log(`Eventos de serial en historial: ${applied}`);
  console.log(`Baselines guardados (sin sobreescribir serial actual): ${counters.baselineCaptured}`);
  console.log(`Baselines fallidos: ${baselineFailures}`);
  console.log(
    `Eventos de seriales no mapeados: ${
      Array.from(unmappedByBus.values()).filter((x) => x.length > 0).length
    } buses`
  );
  console.log(`Eventos no mapeados fallidos: ${unmappedFailures}`);

  if (failureSamples.length) {
    console.log("\n--- Muestras de errores en apply ---");
    for (const sample of failureSamples) console.log(`- ${sample}`);
  }
}

main()
  .catch((error) => {
    console.error("Error importando Inventario_CB:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
