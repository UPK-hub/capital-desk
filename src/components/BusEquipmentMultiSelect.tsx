"use client";

import * as React from "react";
import { BatteryCharging, HardDrive, Radio, Video, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type EquipOption = {
  id: string;
  serial: string | null;
  location: string | null;
  active: boolean;
  equipmentType?: { name: string };
};

function normalizeEquipments(payload: any): EquipOption[] {
  const candidates =
    payload?.equipments ??
    payload?.busEquipments ??
    payload?.busEquipment ??
    payload?.data?.equipments ??
    [];

  if (!Array.isArray(candidates)) return [];

  return candidates.map((e: any) => ({
    id: String(e.id),
    serial: e.serial ?? null,
    location: e.location ?? null,
    active: Boolean(e.active ?? true),
    equipmentType: e.equipmentType ? { name: String(e.equipmentType.name) } : undefined,
  }));
}

type EquipmentCategory = "CAMARAS" | "ALMACENAMIENTO" | "CONECTIVIDAD" | "ENERGIA" | "SIN_CLASIFICAR";

const CATEGORY_ORDER: EquipmentCategory[] = [
  "CAMARAS",
  "ALMACENAMIENTO",
  "CONECTIVIDAD",
  "ENERGIA",
  "SIN_CLASIFICAR",
];

const CATEGORY_META: Record<
  EquipmentCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }
> = {
  CAMARAS: { label: "Camaras", icon: Video, tone: "bg-blue-50 text-blue-700" },
  ALMACENAMIENTO: { label: "Almacenamiento", icon: HardDrive, tone: "bg-violet-50 text-violet-700" },
  CONECTIVIDAD: { label: "Conectividad", icon: Radio, tone: "bg-emerald-50 text-emerald-700" },
  ENERGIA: { label: "Energia", icon: BatteryCharging, tone: "bg-amber-50 text-amber-700" },
  SIN_CLASIFICAR: { label: "Sin clasificar", icon: Wrench, tone: "bg-slate-100 text-slate-700" },
};

type DecoratedEquipment = EquipOption & {
  label: string;
  category: EquipmentCategory;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function categoryFromEquipment(item: EquipOption): EquipmentCategory {
  const source = normalizeText(`${item.equipmentType?.name ?? ""} ${item.location ?? ""}`);

  if (/(^|\s)(camara|camera|bfe|bte|bo|bv[_a-z0-9-]*)(\s|$)/.test(source)) return "CAMARAS";
  if (/(^|\s)(bateria|baterias|battery|batteries|controlador|carga|power|fuente)(\s|$)/.test(source)) {
    return "ENERGIA";
  }
  if (/(^|\s)(disco|discos|hdd|ssd)(\s|$)/.test(source)) return "CONECTIVIDAD";
  if (/(^|\s)(storage|almacenamiento)(\s|$)/.test(source)) return "ALMACENAMIENTO";
  if (/(^|\s)(nvr|router|sim|switch|gps|cms|modulo|modem|lte|4g|5g|colector)(\s|$)/.test(source)) {
    return "CONECTIVIDAD";
  }
  return "SIN_CLASIFICAR";
}

function buildLabel(item: EquipOption) {
  return [
    item.equipmentType?.name ?? "Equipo",
    item.location ? `(${item.location})` : null,
    item.serial ? `SN: ${item.serial}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function BusEquipmentMultiSelect({
  busId,
  value,
  onChange,
  disabled,
}: {
  busId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = React.useState<EquipOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    async function run() {
      if (!busId) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/buses/${busId}`, { cache: "no-store" });
        if (!res.ok) {
          setItems([]);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!alive) return;
        setItems(normalizeEquipments(data));
      } catch {
        if (!alive) return;
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [busId]);

  const activeItems = React.useMemo(() => items.filter((x) => x.active), [items]);

  const decoratedItems = React.useMemo<DecoratedEquipment[]>(
    () =>
      activeItems.map((item) => {
        const label = buildLabel(item);
        return {
          ...item,
          label,
          category: categoryFromEquipment(item),
        };
      }),
    [activeItems]
  );

  const groupedFilteredItems = React.useMemo(() => {
    const grouped = new Map<EquipmentCategory, DecoratedEquipment[]>();
    for (const category of CATEGORY_ORDER) grouped.set(category, []);
    for (const item of decoratedItems) {
      const list = grouped.get(item.category);
      if (list) list.push(item);
    }
    return grouped;
  }, [decoratedItems]);

  const selectedItems = React.useMemo(
    () => decoratedItems.filter((item) => value.includes(item.id)),
    [decoratedItems, value]
  );

  function setChecked(id: string, checked: boolean) {
    if (!checked) {
      onChange(value.filter((x) => x !== id));
      return;
    }
    if (value.includes(id)) return;
    onChange([...value, id]);
  }

  function selectAll() {
    if (disabled) return;
    onChange(decoratedItems.map((item) => item.id));
  }

  function clearAll() {
    if (disabled) return;
    onChange([]);
  }

  if (!busId) {
    return <div className="sts-card px-3 py-2 text-sm text-muted-foreground">Selecciona un bus primero</div>;
  }

  if (loading) {
    return <div className="sts-card px-3 py-2 text-sm text-muted-foreground">Cargando equipos...</div>;
  }

  if (!decoratedItems.length) {
    return <div className="sts-card px-3 py-2 text-sm text-muted-foreground">Sin equipos activos</div>;
  }

  return (
    <div className={`space-y-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedItems.length} de {decoratedItems.length} seleccionados
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={selectAll}
            disabled={disabled}
          >
            Todos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={clearAll}
            disabled={disabled}
          >
            Ninguno
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
        <div className="equipment-list-scroll max-h-[500px] overflow-y-auto">
          {!decoratedItems.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No se encontraron equipos.</div>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const categoryItems = groupedFilteredItems.get(category) ?? [];
              if (!categoryItems.length) return null;
              const meta = CATEGORY_META[category];
              const Icon = meta.icon;

              return (
                <section key={category} className="border-b border-border/50 last:border-b-0">
                  <header
                    className={`sticky top-0 z-10 flex items-center gap-2 border-y border-border/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${meta.tone}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{meta.label}</span>
                    <span className="opacity-70">({categoryItems.length})</span>
                  </header>
                  <div className="grid grid-cols-1 gap-px bg-border/50 md:grid-cols-2 xl:grid-cols-3">
                    {categoryItems.map((item) => {
                      const checked = value.includes(item.id);
                      const equipmentName = item.equipmentType?.name ?? "Equipo";
                      const location = item.location ? ` (${item.location})` : "";
                      return (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-start gap-2.5 bg-background px-3 py-2.5 transition-colors ${
                            checked ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/35"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={(e) => setChecked(item.id, e.target.checked)}
                            disabled={disabled}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {equipmentName}
                              {location}
                            </span>
                            {item.serial ? (
                              <span className="block truncate text-xs text-muted-foreground">SN: {item.serial}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>

      {selectedItems.length ? (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-background px-2 py-0.5 text-xs text-foreground"
            >
              <span className="max-w-[180px] truncate">{item.equipmentType?.name ?? "Equipo"}</span>
              <button
                type="button"
                onClick={() => setChecked(item.id, false)}
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Quitar ${item.equipmentType?.name ?? "equipo"}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
