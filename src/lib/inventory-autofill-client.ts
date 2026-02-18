const modelCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const searchCache = new Map<string, Array<{ serial: string; model: string }>>();
const searchPending = new Map<string, Promise<Array<{ serial: string; model: string }>>>();

export function sanitizeModelText(value: string | null | undefined): string {
  let text = String(value ?? "").trim();
  if (!text) return "";
  text = text.replace(/\uFFFD/g, "");
  text = text.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, "");
  text = text.replace(/\(\s*\?{2,}\s*\)/g, "");
  text = text.replace(/\[\s*\?{2,}\s*\]/g, "");
  text = text.replace(/\?{3,}/g, "");
  text = text.replace(/\s{2,}/g, " ").trim();
  return text;
}

export function normalizeSerialForLookup(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function lookupModelBySerial(serialInput: string | null | undefined): Promise<string | null> {
  const serial = normalizeSerialForLookup(serialInput);
  if (!serial) return null;

  if (modelCache.has(serial)) return modelCache.get(serial) ?? null;
  if (pending.has(serial)) return pending.get(serial)!;

  const request = (async () => {
    try {
      const url = `/api/inventory/lookup?q=${encodeURIComponent(serial)}&exact=1`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        modelCache.set(serial, null);
        return null;
      }
      const data = await res.json().catch(() => null);
      const modelRaw = data?.item?.model;
      const modelSanitized = sanitizeModelText(typeof modelRaw === "string" ? modelRaw : "");
      const model = modelSanitized.length ? modelSanitized : null;
      modelCache.set(serial, model);
      return model;
    } catch {
      modelCache.set(serial, null);
      return null;
    }
  })();

  pending.set(serial, request);
  try {
    return await request;
  } finally {
    pending.delete(serial);
  }
}

export async function searchInventorySerialSuggestions(
  queryInput: string | null | undefined,
  limit = 8
): Promise<Array<{ serial: string; model: string }>> {
  const query = normalizeSerialForLookup(queryInput);
  if (query.length < 2) return [];

  const key = `${query}|${Math.max(1, Math.min(50, Number(limit) || 8))}`;
  if (searchCache.has(key)) return searchCache.get(key)!;
  if (searchPending.has(key)) return searchPending.get(key)!;

  const request = (async () => {
    try {
      const url = `/api/inventory/lookup?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(
        String(limit)
      )}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        searchCache.set(key, []);
        return [];
      }
      const data = await res.json().catch(() => null);
      const itemsRaw = Array.isArray(data?.items) ? data.items : [];
      const items = itemsRaw
        .map((x: any) => ({
          serial: normalizeSerialForLookup(x?.serial),
          model: sanitizeModelText(String(x?.model ?? "")),
        }))
        .filter((x: { serial: string; model: string }) => Boolean(x.serial))
        .slice(0, limit);
      searchCache.set(key, items);
      return items;
    } catch {
      searchCache.set(key, []);
      return [];
    }
  })();

  searchPending.set(key, request);
  try {
    return await request;
  } finally {
    searchPending.delete(key);
  }
}
