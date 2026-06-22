"use client";

import * as React from "react";
import Link from "next/link";
import { videoCaseStatusLabels, videoDownloadStatusLabels } from "@/lib/labels";

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

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusTone(s: string) {
  if (s === "COMPLETADO") return "bg-green-50 text-green-700 border-green-200";
  if (s === "EN_CURSO") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function downloadTone(s: string) {
  if (s === "DESCARGA_REALIZADA") return "bg-green-50 text-green-700 border-green-200";
  if (s === "DESCARGA_FALLIDA") return "bg-red-50 text-red-700 border-red-200";
  if (s === "BUS_NO_EN_PATIO") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

const CASE_LABEL = videoCaseStatusLabels as Record<string, string>;
const DL_LABEL = videoDownloadStatusLabels as Record<string, string>;

const inputCls = "h-8 w-full rounded-md border border-border/70 px-2 text-xs focus-visible:outline-none";

export default function RequestsFilterTable({ rows }: { rows: Row[] }) {
  const [fCaso, setFCaso] = React.useState("");
  const [fBus, setFBus] = React.useState("");
  const [fEstado, setFEstado] = React.useState("");
  const [fDescarga, setFDescarga] = React.useState("");
  const [fTecnico, setFTecnico] = React.useState("");

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (fCaso && !String(r.caseNo ?? "").toLowerCase().includes(fCaso.trim().toLowerCase())) return false;
      if (fBus && !String(r.busCode ?? "").toLowerCase().includes(fBus.trim().toLowerCase())) return false;
      if (fEstado && r.status !== fEstado) return false;
      if (fDescarga && r.downloadStatus !== fDescarga) return false;
      if (fTecnico && !String(r.tech ?? "").toLowerCase().includes(fTecnico.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, fCaso, fBus, fEstado, fDescarga, fTecnico]);

  const hasFilter = Boolean(fCaso || fBus || fEstado || fDescarga || fTecnico);

  return (
    <section className="mobile-section-card">
      <div className="mobile-section-card__header flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Mis solicitudes</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {filtered.length} de {rows.length}
          </p>
          {hasFilter ? (
            <button
              type="button"
              onClick={() => {
                setFCaso("");
                setFBus("");
                setFEstado("");
                setFDescarga("");
                setFTecnico("");
              }}
              className="text-xs underline text-muted-foreground"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </div>

      <div className="mobile-section-card__body overflow-x-auto pt-4">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">Fecha</th>
              <th className="px-2 py-2">Caso</th>
              <th className="px-2 py-2">Bus</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Descarga</th>
              <th className="px-2 py-2">Técnico</th>
              <th className="px-2 py-2 text-right">Acción</th>
            </tr>
            <tr className="border-b border-border/60 align-top">
              <th className="px-2 pb-2"></th>
              <th className="px-2 pb-2">
                <input className={inputCls} placeholder="N°…" value={fCaso} onChange={(e) => setFCaso(e.target.value)} />
              </th>
              <th className="px-2 pb-2">
                <input className={inputCls} placeholder="Bus…" value={fBus} onChange={(e) => setFBus(e.target.value)} />
              </th>
              <th className="px-2 pb-2">
                <select className={inputCls} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="EN_ESPERA">{CASE_LABEL.EN_ESPERA}</option>
                  <option value="EN_CURSO">{CASE_LABEL.EN_CURSO}</option>
                  <option value="COMPLETADO">{CASE_LABEL.COMPLETADO}</option>
                </select>
              </th>
              <th className="px-2 pb-2">
                <select className={inputCls} value={fDescarga} onChange={(e) => setFDescarga(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="PENDIENTE">{DL_LABEL.PENDIENTE}</option>
                  <option value="DESCARGA_REALIZADA">{DL_LABEL.DESCARGA_REALIZADA}</option>
                  <option value="DESCARGA_FALLIDA">{DL_LABEL.DESCARGA_FALLIDA}</option>
                  <option value="BUS_NO_EN_PATIO">{DL_LABEL.BUS_NO_EN_PATIO}</option>
                </select>
              </th>
              <th className="px-2 pb-2">
                <input
                  className={inputCls}
                  placeholder="Técnico…"
                  value={fTecnico}
                  onChange={(e) => setFTecnico(e.target.value)}
                />
              </th>
              <th className="px-2 pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-8 text-center text-sm text-muted-foreground">
                  Sin solicitudes que coincidan.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{r.caseNo ?? r.caseId}</div>
                    <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.title}>
                      {r.title}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-medium">{r.busCode}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusTone(r.status)}`}>
                      {CASE_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${downloadTone(r.downloadStatus)}`}>
                      {DL_LABEL[r.downloadStatus] ?? r.downloadStatus}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs">{r.tech ?? "Sin asignar"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <Link href={`/video-requests/${r.id}`} className="text-xs underline">
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
