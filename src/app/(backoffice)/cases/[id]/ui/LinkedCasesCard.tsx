"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LinkedCase = {
  id: string;
  caseNo: number | null;
  type: "CORRECTIVO" | "PREVENTIVO";
  typeLabel: string;
  status: string;
  statusLabel: string;
  workOrderId: string | null;
  manual: boolean;
};

type Props = {
  novedadId: string;
  novedadCaseNo: number | null;
  novedadStatus: string;
  busId: string | null;
  canManage: boolean;
  linked: LinkedCase[];
};

function fmtCaseNo(n?: number | null) {
  if (!n) return "CASO--";
  return `CASO-${String(n).padStart(3, "0")}`;
}

function statusBadgeClass(status: string) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium";
  if (status === "NUEVO") return `${base} border-blue-200 bg-blue-50 text-blue-700`;
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION")
    return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (status === "RESUELTO" || status === "CERRADO")
    return `${base} border-green-200 bg-green-50 text-green-700`;
  return `${base} border-border text-muted-foreground`;
}

export default function LinkedCasesCard(props: Props) {
  const router = useRouter();
  const [linkValue, setLinkValue] = useState("");
  const [linking, setLinking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busParam = props.busId ? `&busId=${encodeURIComponent(props.busId)}` : "";
  const createCorrectiveHref = `/cases/new?type=CORRECTIVO&fromNovedad=${encodeURIComponent(
    props.novedadId
  )}${busParam}`;
  const createPreventiveHref = `/cases/new?type=PREVENTIVO&fromNovedad=${encodeURIComponent(
    props.novedadId
  )}${busParam}`;

  const isClosed = props.novedadStatus === "CERRADO";

  async function onLink() {
    setError(null);
    setNotice(null);
    const raw = linkValue.trim();
    if (!raw) {
      setError("Indica el número del caso a atar.");
      return;
    }
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits) {
      setError("Número de caso inválido.");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/cases/${props.novedadId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCaseNo: Number(digits) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo atar el caso.");
      setNotice(data?.alreadyLinked ? "El caso ya estaba enlazado." : "Caso atado correctamente.");
      setLinkValue("");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo atar el caso.");
    } finally {
      setLinking(false);
    }
  }

  async function onCloseNovedad() {
    setError(null);
    setNotice(null);
    if (!window.confirm("¿Cerrar esta novedad? Quedará en estado CERRADO.")) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/cases/${props.novedadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CERRADO" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo cerrar la novedad.");
      setNotice("Novedad cerrada.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cerrar la novedad.");
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Casos enlazados</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Correctivos y preventivos asociados a esta novedad.
        </p>
      </div>

      <div className="space-y-3 p-5">
        {props.linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay casos enlazados.</p>
        ) : (
          <div className="space-y-2">
            {props.linked.map((item) => (
              <div key={item.id} className="sts-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.typeLabel} · {fmtCaseNo(item.caseNo)}
                      {item.manual ? (
                        <span className="ml-2 inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          atado manual
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className={statusBadgeClass(item.status)}>{item.statusLabel}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/cases/${item.id}`}
                    className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                  >
                    Abrir caso
                  </Link>
                  {item.workOrderId ? (
                    <Link
                      href={`/work-orders/${item.workOrderId}`}
                      className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                    >
                      Abrir OT
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {props.canManage ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link
                href={createCorrectiveHref}
                className="sts-btn-primary inline-flex h-9 items-center justify-center px-3 text-sm"
              >
                Crear correctivo
              </Link>
              <Link
                href={createPreventiveHref}
                className="sts-btn-primary inline-flex h-9 items-center justify-center px-3 text-sm"
              >
                Crear preventivo
              </Link>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <label className="text-xs text-muted-foreground">Atar caso existente (número)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  placeholder="Ej: 123 o CASO-123"
                  className="app-field-control h-9 w-full rounded-xl border px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void onLink()}
                  disabled={linking}
                  className="sts-btn-ghost inline-flex h-9 shrink-0 items-center justify-center px-3 text-sm disabled:opacity-60"
                >
                  {linking ? "Atando..." : "Atar"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void onCloseNovedad()}
              disabled={closing || isClosed}
              className="sts-btn-ghost inline-flex h-9 w-full items-center justify-center px-3 text-sm disabled:opacity-60"
            >
              {isClosed ? "Novedad cerrada" : closing ? "Cerrando..." : "Cerrar novedad"}
            </button>
          </>
        ) : null}

        {notice ? <p className="text-xs text-green-700">{notice}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
