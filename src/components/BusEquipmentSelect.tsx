"use client";

import * as React from "react";
import { Select } from "@/components/Field";

type EquipOption = {
  id: string;
  serial: string | null;
  location: string | null;
  active: boolean;
  equipmentType?: { name: string };
};

function normalizeEquipments(payload: any): EquipOption[] {
  // tolerante a múltiples formas
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

export function BusEquipmentSelect({
  busId,
  value,
  onChange,
  disabled,
}: {
  busId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
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

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? e.target.value : null)}
      disabled={disabled || !busId}
    >
      <option value="">{busId ? "Selecciona un equipo" : "Selecciona un bus primero"}</option>
      {items
        .filter((x) => x.active)
        .map((x) => {
          const label = [
            x.equipmentType?.name ?? "Equipo",
            x.location ? `(${x.location})` : null,
            x.serial ? `SN: ${x.serial}` : null,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <option key={x.id} value={x.id}>
              {label}
            </option>
          );
        })}
    </Select>
  );
}
