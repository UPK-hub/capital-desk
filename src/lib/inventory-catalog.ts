import { prisma } from "@/lib/prisma";

export type InventoryCatalogItem = {
  serial: string;
  model: string;
  brand?: string | null;
};

type TenantCatalogCache = {
  bySerial: Map<string, InventoryCatalogItem>;
  items: InventoryCatalogItem[];
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const tenantCache = new Map<string, TenantCatalogCache>();
const pendingLoads = new Map<string, Promise<TenantCatalogCache>>();

export function normalizeInventorySerial(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

async function loadTenantCatalogFromDb(tenantId: string): Promise<TenantCatalogCache> {
  const rows = await prisma.inventorySerialCatalog.findMany({
    where: { tenantId },
    orderBy: [{ serialNormalized: "asc" }],
    select: {
      serialNormalized: true,
      serialDisplay: true,
      model: true,
      brand: true,
    },
  });

  const bySerial = new Map<string, InventoryCatalogItem>();
  const items: InventoryCatalogItem[] = [];

  for (const row of rows) {
    const serialKey = normalizeInventorySerial(row.serialNormalized || row.serialDisplay);
    if (!serialKey) continue;

    const serialDisplay = String(row.serialDisplay || row.serialNormalized).trim() || serialKey;
    const model = String(row.model ?? "").trim();

    const item: InventoryCatalogItem = {
      serial: serialDisplay,
      model,
      brand: row.brand ?? null,
    };

    if (!bySerial.has(serialKey)) bySerial.set(serialKey, item);
    items.push(item);
  }

  return {
    bySerial,
    items,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

async function getTenantCatalog(tenantId: string): Promise<TenantCatalogCache> {
  const cached = tenantCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const pending = pendingLoads.get(tenantId);
  if (pending) return pending;

  const loader = (async () => {
    const loaded = await loadTenantCatalogFromDb(tenantId);
    tenantCache.set(tenantId, loaded);
    return loaded;
  })();

  pendingLoads.set(tenantId, loader);
  try {
    return await loader;
  } finally {
    pendingLoads.delete(tenantId);
  }
}

export async function findInventoryModelBySerial(
  tenantId: string,
  serialInput: string | null | undefined
): Promise<string | null> {
  const serial = normalizeInventorySerial(serialInput);
  if (!serial) return null;

  const catalog = await getTenantCatalog(tenantId);
  return catalog.bySerial.get(serial)?.model ?? null;
}

export async function searchInventoryBySerial(
  tenantId: string,
  queryInput: string | null | undefined,
  limit = 10
): Promise<InventoryCatalogItem[]> {
  const query = normalizeInventorySerial(queryInput);
  if (!query) return [];

  const catalog = await getTenantCatalog(tenantId);
  const max = Math.max(1, Math.min(100, Number(limit) || 10));

  const starts: InventoryCatalogItem[] = [];
  const contains: InventoryCatalogItem[] = [];

  for (const item of catalog.items) {
    const serial = normalizeInventorySerial(item.serial);
    if (serial.startsWith(query)) starts.push(item);
    else if (serial.includes(query)) contains.push(item);

    if (starts.length + contains.length >= max) break;
  }

  return [...starts, ...contains].slice(0, max);
}

export function invalidateInventoryCatalogCache(tenantId?: string) {
  if (tenantId) {
    tenantCache.delete(tenantId);
    pendingLoads.delete(tenantId);
    return;
  }
  tenantCache.clear();
  pendingLoads.clear();
}
