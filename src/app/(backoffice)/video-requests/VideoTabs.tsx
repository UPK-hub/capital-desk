"use client";

// Pestañas del módulo de videos:
//  - "Tabla": lista de solicitudes con filtro por columna (vista por defecto).
//  - "Tablero": resumen/métricas.
//  - "Solicitudes": lista con filtros del servidor (children).

import * as React from "react";
import VideoDashboard from "./VideoDashboard";
import RequestsFilterTable from "./RequestsFilterTable";

type Row = {
  id: string;
  status: string;
  downloadStatus: string;
  origin: string;
  createdAt: string;
  tech: string | null;
  busCode: string;
  caseNo: number | null;
  caseId: string;
  title: string;
};

type Tab = "tabla" | "tablero" | "solicitudes";

export default function VideoTabs({
  rows,
  initialTab = "tabla",
  children,
}: {
  rows: Row[];
  initialTab?: Tab;
  children: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const base = "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition";
  const inactive = "text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  const current = "bg-background text-foreground shadow-sm ring-1 ring-border/60";

  return (
    <div className="space-y-4">
      <nav className="inline-flex w-fit gap-1 rounded-lg border border-border/70 bg-muted/25 p-1">
        <button type="button" onClick={() => setTab("tabla")} className={`${base} ${tab === "tabla" ? current : inactive}`}>
          Tabla
        </button>
        <button type="button" onClick={() => setTab("tablero")} className={`${base} ${tab === "tablero" ? current : inactive}`}>
          Tablero
        </button>
        <button
          type="button"
          onClick={() => setTab("solicitudes")}
          className={`${base} ${tab === "solicitudes" ? current : inactive}`}
        >
          Solicitudes
        </button>
      </nav>

      {tab === "tabla" ? (
        <RequestsFilterTable rows={rows} />
      ) : tab === "tablero" ? (
        <VideoDashboard rows={rows} />
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </div>
  );
}
