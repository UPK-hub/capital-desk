"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/Field";

type Creator = { id: string; name: string };

export default function CasesFilterBar(props: {
  basePath?: string;
  status?: string;
  rmonth?: string;
  assigned?: string;
  q?: string;
  type?: string;
  priority?: string;
  creator?: string;
  dateFrom?: string;
  dateTo?: string;
  typeLabels: Record<string, string>;
  creators: Creator[];
}) {
  const basePath = props.basePath ?? "/cases";
  const router = useRouter();
  const [q, setQ] = React.useState(props.q ?? "");
  const [type, setType] = React.useState(props.type ?? "");
  const [priority, setPriority] = React.useState(props.priority ?? "");
  const [creator, setCreator] = React.useState(props.creator ?? "");
  const [dateFrom, setDateFrom] = React.useState(props.dateFrom ?? "");
  const [dateTo, setDateTo] = React.useState(props.dateTo ?? "");
  const timer = React.useRef<any>(null);

  const push = React.useCallback(
    (n: { q: string; type: string; priority: string; creator: string; dateFrom: string; dateTo: string }) => {
      const p = new URLSearchParams();
      const set = (k: string, v?: string) => {
        const s = (v ?? "").trim();
        if (s) p.set(k, s);
      };
      // Conserva la vista/lo no editable aquí.
      set("status", props.status);
      set("rmonth", props.rmonth);
      set("assigned", props.assigned);
      set("q", n.q);
      set("type", n.type);
      set("priority", n.priority);
      set("creator", n.creator);
      set("dateFrom", n.dateFrom);
      set("dateTo", n.dateTo);
      const qs = p.toString();
      router.push(`${basePath}${qs ? `?${qs}` : ""}`);
    },
    [router, basePath, props.status, props.rmonth, props.assigned]
  );

  const current = () => ({ q, type, priority, creator, dateFrom, dateTo });
  const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2 lg:col-span-2">
          <label className={lbl}>Buscar</label>
          <input
            value={q}
            placeholder="Bus, placa, título, # caso/OT"
            className="app-field-control h-9 w-full rounded-lg px-3 text-sm"
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => push({ ...current(), q: v }), 400);
            }}
          />
        </div>
        <div>
          <label className={lbl}>Tipo</label>
          <Select
            name="type"
            className="h-9 w-full"
            value={type}
            onChange={(e: any) => {
              const v = String(e.target.value);
              setType(v);
              push({ ...current(), type: v });
            }}
          >
            <option value="">Todos</option>
            <option value="CORRECTIVO">{props.typeLabels.CORRECTIVO}</option>
            <option value="PREVENTIVO">{props.typeLabels.PREVENTIVO}</option>
            <option value="RENOVACION_TECNOLOGICA">{props.typeLabels.RENOVACION_TECNOLOGICA}</option>
            <option value="SOLICITUD_DESCARGA_VIDEO">{props.typeLabels.SOLICITUD_DESCARGA_VIDEO}</option>
          </Select>
        </div>
        <div>
          <label className={lbl}>Prioridad</label>
          <Select
            name="priority"
            className="h-9 w-full"
            value={priority}
            onChange={(e: any) => {
              const v = String(e.target.value);
              setPriority(v);
              push({ ...current(), priority: v });
            }}
          >
            <option value="">Todas</option>
            <option value="1">1 (Alta)</option>
            <option value="2">2</option>
            <option value="3">3 (Normal)</option>
            <option value="4">4</option>
            <option value="5">5 (Baja)</option>
          </Select>
        </div>
        <div>
          <label className={lbl}>Creador</label>
          <Select
            name="creator"
            className="h-9 w-full"
            value={creator}
            onChange={(e: any) => {
              const v = String(e.target.value);
              setCreator(v);
              push({ ...current(), creator: v });
            }}
          >
            <option value="">Todos</option>
            {props.creators.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={lbl}>Desde</label>
          <input
            type="date"
            aria-label="Fecha desde"
            className="app-field-control h-9 w-full rounded-lg px-2 text-sm"
            value={dateFrom}
            onChange={(e) => {
              const v = e.target.value;
              setDateFrom(v);
              push({ ...current(), dateFrom: v });
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="w-40">
          <input
            type="date"
            aria-label="Fecha hasta"
            title="Fecha hasta"
            className="app-field-control h-9 w-full rounded-lg px-2 text-sm"
            value={dateTo}
            onChange={(e) => {
              const v = e.target.value;
              setDateTo(v);
              push({ ...current(), dateTo: v });
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Link className="sts-btn-ghost inline-flex h-9 items-center justify-center px-4 text-sm" href={basePath}>
            Limpiar
          </Link>
        </div>
      </div>
    </div>
  );
}
