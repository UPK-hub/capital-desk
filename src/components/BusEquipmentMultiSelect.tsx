"use client";

import * as React from "react";

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

  React.useEffect(() => {
    let alive = true;
    async function run() {
      if (!busId) {
        setItems([]);
        return;
      }
      try {
        const res = await fetch(`/api/buses/${busId}`, { cache: "no-store" });
        if (!res.ok) {
          setItems([]);
          return;
        }
        const data = await res.json();
        if (!alive) return;
        setItems(normalizeEquipments(data));
      } catch {
        if (!alive) return;
        setItems([]);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [busId]);

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...value, id] : value.filter((x) => x !== id);
    onChange(next);
  }

  if (!busId) {
    return <div className="sts-card px-3 py-2 text-sm text-muted-foreground">Selecciona un bus primero</div>;
  }

  const activeItems = items.filter((x) => x.active);
  if (!activeItems.length) {
    return <div className="sts-card px-3 py-2 text-sm text-muted-foreground">Sin equipos activos</div>;
  }

  return (
    <div className="space-y-2">
      {activeItems.map((x) => {
        const label = [
          x.equipmentType?.name ?? "Equipo",
          x.location ? `(${x.location})` : null,
          x.serial ? `SN: ${x.serial}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const checked = value.includes(x.id);
        return (
          <label key={x.id} className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => toggle(x.id, e.target.checked)}
              disabled={disabled}
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}
