"use client";

import * as React from "react";
import { CASE_EVENT_LABELS, fmtCaseNo, fmtWoNo } from "@/lib/traceability/labels";

type TimelineItem = {
  kind: "CASE" | "BUS" | "WO_STEP" | "FORM";
  id: string;
  at: string | Date;
  type: string;
  message: string | null;
  actor: { id: string; name: string; role: string } | null;
  refs: { caseNo?: number | null; workOrderNo?: number | null; workOrderId?: string | null };
  meta: any;
};

function fmtDate(d: any) {
  const x = new Date(d);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(x);
}

function pill(cls: string) {
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`;
}

export default function TraceabilityTimeline({ caseId }: { caseId: string }) {
  const [items, setItems] = React.useState<TimelineItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);

      const res = await fetch(`/api/cases/${caseId}/timeline`);
      const data = await res.json().catch(() => ({}));

      if (!alive) return;

      if (!res.ok) {
        setErr(data?.error ?? "No se pudo cargar la trazabilidad");
        setItems([]);
        setLoading(false);
        return;
      }

      setItems(Array.isArray(data?.items) ? data.items : []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [caseId]);

  if (loading) {
    return <div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">Cargando trazabilidad.</div>;
  }

  if (err) {
    return <div className="rounded-xl border bg-white p-5 text-sm">{err}</div>;
  }

  if (!items.length) {
    return <div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">Sin eventos.</div>;
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Trazabilidad</h2>
        <p className="text-xs text-muted-foreground">{items.length} eventos</p>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((it) => {
          const label =
            it.kind === "CASE"
              ? (CASE_EVENT_LABELS as any)[it.type] ?? it.type
              : it.kind === "FORM"
              ? it.type === "PREVENTIVE"
                ? "Formato preventivo"
                : "Formato correctivo"
              : it.type === "WO_ASSIGNED"
              ? "OT asignada"
              : it.type;

          const secondary = it.message ?? null;
          const actor = it.actor?.name ? `${it.actor.name}` : null;

          return (
            <div key={it.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={pill(it.kind === "CASE" ? "bg-white" : "bg-white")}>
                      {it.kind === "CASE"
                        ? "CASO"
                        : it.kind === "BUS"
                        ? "BUS"
                        : it.kind === "WO_STEP"
                        ? "OT"
                        : "FORM"}
                    </span>
                    <p className="text-sm font-semibold">{label}</p>

                    <span className="text-xs text-muted-foreground">
                      {fmtCaseNo(it.refs?.caseNo ?? null)}
                      {it.refs?.workOrderNo ? ` | ${fmtWoNo(it.refs.workOrderNo)}` : ""}
                    </span>
                  </div>

                  {secondary ? (
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{secondary}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {actor ? (
                      <span>
                        Por: <span className="font-medium text-foreground">{actor}</span>
                      </span>
                    ) : null}
                    {it.refs?.workOrderId ? (
                      <span className="font-mono opacity-70">ref: {String(it.refs.workOrderId).slice(0, 10)}.</span>
                    ) : null}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(it.at)}</p>
              </div>

              {it.meta?.media?.length ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {it.meta.media.map((m: any, idx: number) => (
                    <img
                      key={`${m.filePath}-${idx}`}
                      src={`/api/uploads/${m.filePath}`}
                      alt={m.kind ?? "Evidencia"}
                      className="h-40 w-full rounded-md border object-cover"
                    />
                  ))}
                </div>
              ) : null}

              {it.kind === "FORM" && it.meta?.pdfUrl ? (
                <div className="mt-3">
                  <a className="text-xs underline" href={it.meta.pdfUrl} target="_blank" rel="noreferrer">
                    Descargar PDF
                  </a>
                </div>
              ) : null}

              {it.meta ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Ver detalles técnicos</summary>
                  <pre className="mt-2 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                    {JSON.stringify(it.meta, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
