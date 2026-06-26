"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Link2, X } from "lucide-react";

type Member = {
  id: string;
  caseNo: number | null;
  status: string;
  statusLabel: string;
  createdAt: string;
  busCode: string;
};

type Props = {
  novedadId: string;
  novedadCaseNo: number | null;
  busCode: string | null;
  canManage: boolean;
  groupId: string | null;
  members: Member[];
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

export default function DuplicateNovedadesCard(props: Props) {
  const router = useRouter();
  const [linkValue, setLinkValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const count = props.members.length + (props.groupId ? 1 : 0);

  async function onLink() {
    setError(null);
    setNotice(null);
    const digits = linkValue.replace(/[^0-9]/g, "");
    if (!digits) {
      setError("Indica el número de la novedad a enlazar.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/cases/${props.novedadId}/duplicates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCaseNo: Number(digits) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo enlazar la novedad.");
      setNotice(data?.alreadyLinked ? "Ya estaban enlazadas." : "Novedades enlazadas como el mismo caso.");
      setLinkValue("");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo enlazar la novedad.");
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink(targetCaseId?: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/cases/${props.novedadId}/duplicates`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetCaseId ? { targetCaseId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo desenlazar.");
      setNotice("Novedad desenlazada del grupo.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo desenlazar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Layers className="h-4 w-4 text-amber-600" /> Novedades del mismo caso
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {count > 1
            ? `Este caso (${props.busCode ?? "bus"}) fue reportado ${count} veces. Las novedades quedan enlazadas; no se cierran.`
            : "Enlaza aquí otras novedades que sean el mismo caso (mismo bus reportado varias veces)."}
        </p>
      </div>

      <div className="space-y-3 p-5">
        {props.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin novedades enlazadas todavía.</p>
        ) : (
          <div className="space-y-2">
            {props.members.map((item) => (
              <div key={item.id} className="sts-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {fmtCaseNo(item.caseNo)} · {item.busCode}
                    </p>
                  </div>
                  <span className={statusBadgeClass(item.status)}>{item.statusLabel}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/cases/${item.id}`}
                    className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                  >
                    Abrir novedad
                  </Link>
                  {props.canManage ? (
                    <button
                      type="button"
                      onClick={() => void onUnlink(item.id)}
                      disabled={busy}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/60 px-2.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <X className="h-3 w-3" /> Quitar
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {props.canManage ? (
          <>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <label className="text-xs text-muted-foreground">
                Enlazar otra novedad (número de caso)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  placeholder="Ej: 2480 o CASO-2480"
                  className="app-field-control h-9 w-full rounded-xl border px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void onLink()}
                  disabled={busy}
                  className="sts-btn-ghost inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-sm disabled:opacity-60"
                >
                  <Link2 className="h-4 w-4" /> {busy ? "..." : "Enlazar"}
                </button>
              </div>
            </div>

            {props.groupId ? (
              <button
                type="button"
                onClick={() => void onUnlink()}
                disabled={busy}
                className="inline-flex h-9 w-full items-center justify-center px-3 text-xs text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
              >
                Sacar esta novedad del grupo
              </button>
            ) : null}
          </>
        ) : null}

        {notice ? <p className="text-xs text-green-700">{notice}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
