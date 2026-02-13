"use client";

import * as React from "react";

type ShiftLog = {
  id: string;
  startedAt: string;
  endedAt: string | null;
};

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export default function ShiftClockCard() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [openShift, setOpenShift] = React.useState<ShiftLog | null>(null);
  const [recent, setRecent] = React.useState<ShiftLog[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/technicians/me/shift", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "No se pudo cargar turno.");
      setLoading(false);
      return;
    }
    setOpenShift(data?.open ?? null);
    setRecent(Array.isArray(data?.recent) ? data.recent : []);
    setError(null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const startShift = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/technicians/me/shift/start", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(data?.error ?? "No se pudo iniciar turno.");
      return;
    }
    setMsg("Turno iniciado.");
    await load();
  };

  const endShift = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/technicians/me/shift/end", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(data?.error ?? "No se pudo cerrar turno.");
      return;
    }
    setMsg("Turno finalizado.");
    await load();
  };

  return (
    <section className="sts-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Mi turno</h2>
          <p className="text-xs text-muted-foreground">Registra ingreso y salida.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="sts-btn-primary text-sm disabled:opacity-60"
            disabled={saving || loading || Boolean(openShift)}
            onClick={startShift}
            type="button"
          >
            Iniciar turno
          </button>
          <button
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            disabled={saving || loading || !openShift}
            onClick={endShift}
            type="button"
          >
            Cerrar turno
          </button>
        </div>
      </div>

      {msg ? <div className="mt-3 rounded-md border p-3 text-sm">{msg}</div> : null}
      {error ? <div className="mt-3 rounded-md border p-3 text-sm text-red-600">{error}</div> : null}

      <div className="mt-4 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : openShift ? (
          <p>
            Turno en curso desde{" "}
            <span className="font-medium">{fmtDate(openShift.startedAt)}</span>.
          </p>
        ) : (
          <p className="text-muted-foreground">No tienes un turno activo.</p>
        )}
      </div>

      {recent.length ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Últimos registros</p>
          <div className="mt-2 space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="sts-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Inicio: {fmtDate(r.startedAt)}</span>
                  <span className="text-muted-foreground">•</span>
                  <span>
                    Fin: {r.endedAt ? fmtDate(r.endedAt) : "En curso"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
