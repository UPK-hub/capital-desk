"use client";

// Pestañas del módulo de videos: "Tablero" (inicial) y "Solicitudes" (lista).
// La lista llega como children (renderizada en el servidor con sus filtros).

import * as React from "react";
import VideoDashboard from "./VideoDashboard";

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

export default function VideoTabs({
  rows,
  initialTab = "tablero",
  children,
}: {
  rows: Row[];
  initialTab?: "tablero" | "solicitudes";
  children: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<"tablero" | "solicitudes">(initialTab);
  const base = "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition";
  const inactive = "text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  const current = "bg-background text-foreground shadow-sm ring-1 ring-border/60";

  return (
    <div className="space-y-4">
      <nav className="inline-flex w-fit gap-1 rounded-lg border border-border/70 bg-muted/25 p-1">
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

      {tab === "tablero" ? <VideoDashboard rows={rows} /> : <div className="space-y-4">{children}</div>}
    </div>
  );
}
