"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";

type Contacto = { id: string; name: string; email: string };

/**
 * Contacto del cliente al que se le avisa cuando la novedad se cierre.
 * Recibe el reporte de cierre en la aplicación y por correo.
 */
export default function AvisoCierreCard({
  caseId,
  actualId,
  actualNombre,
  canManage = false,
}: {
  caseId: string;
  actualId: string | null;
  actualNombre: string | null;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [contactos, setContactos] = React.useState<Contacto[]>([]);
  const [valor, setValor] = React.useState(actualId ?? "");
  const [guardado, setGuardado] = React.useState(actualId ?? "");
  const [nombre, setNombre] = React.useState(actualNombre);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canManage) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/users/assignable?context=cliente", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelado && res.ok) setContactos(Array.isArray(data?.items) ? data.items : []);
      } catch {
        /* si falla, queda el selector vacío */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [canManage]);

  async function guardar() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/notify-on-close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: valor || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar.");
        return;
      }
      setGuardado(data?.notifyOnCloseUserId ?? "");
      setNombre(data?.notifyOnCloseName ?? null);
      setMsg(valor ? "Aviso de cierre actualizado." : "Se quitó el aviso de cierre.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card p-4 lg:p-5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
        <BellRing className="h-4 w-4 text-muted-foreground" />
        Avisar el cierre al cliente
      </h2>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Cuando esta novedad se cierre, esta persona recibe el reporte de cierre en la aplicación y por
        correo. Aplica también cuando el cierre lo dispara el correctivo.
      </p>

      {canManage ? (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="text-[11px] text-muted-foreground">Contacto del cliente</label>
              <select
                className="h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              >
                <option value="">Sin aviso</option>
                {contactos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.email}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="sts-btn-primary text-sm disabled:opacity-60"
              disabled={saving || valor === guardado}
              onClick={guardar}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          {msg ? <p className="mt-2 text-xs text-green-700">{msg}</p> : null}
        </>
      ) : (
        <p className="mt-3 text-sm font-medium text-slate-700">{nombre ?? "Sin aviso configurado"}</p>
      )}
    </section>
  );
}
