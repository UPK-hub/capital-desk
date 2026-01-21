"use client";

import * as React from "react";
import { Input } from "@/components/Field";

type Props = {
  value: string; // ISO-ish o vacío
  onChange: (value: string) => void;
  disabled?: boolean;
};

function toLocalDatetimeValue(v: string) {
  // Para <input type="datetime-local"> necesitamos "YYYY-MM-DDTHH:mm"
  // Si viene vacío o inválido, devolvemos vacío.
  if (!v) return "";
  // Si ya viene como "YYYY-MM-DDTHH:mm", lo devolvemos.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return v;

  // Si viene ISO con segundos, recortamos.
  const m = v.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (m?.[1]) return m[1];

  return "";
}

export function DateTimeField({ value, onChange, disabled }: Props) {
  return (
    <Input
      type="datetime-local"
      value={toLocalDatetimeValue(value)}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}
