"use client";

/**
 * Importación del reporte de cámaras offline del cliente.
 *
 * Pega el cuadro, carga el Excel o el pantallazo, revisa lo que se detectó y
 * crea una novedad por bus con la fecha en que el cliente reportó.
 */

import * as React from "react";
import Link from "next/link";
import { Upload, ClipboardPaste, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type CamaraDetectada = { name: string; ip: string | null; raw: string; desconocida: boolean };

type FilaDetectada = {
  busCode: string;
  busIp: string | null;
  placa: string | null;
  existeEnFlota: boolean;
  cameras: CamaraDetectada[];
  avisos: string[];
  novedadesAbiertas: { caseNo: number | null; title: string; status: string; createdAt: string }[];
};

type FilaEditable = FilaDetectada & { incluir: boolean; camerasText: string };

type Creado = { busCode: string; caseNo: number | null; caseId: string; camaras: number };

type Contacto = { id: string; name: string; email: string };

function textoDeCamaras(cams: CamaraDetectada[]): string {
  return cams.map((c) => `${c.name}${c.ip ? ` (${c.ip})` : ""}`).join("; ");
}

function hoyEnColombia(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function ImportarNovedadesPage() {
  const [texto, setTexto] = React.useState("");
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [fecha, setFecha] = React.useState(hoyEnColombia());
  const [analizando, setAnalizando] = React.useState(false);
  const [creando, setCreando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [filas, setFilas] = React.useState<FilaEditable[] | null>(null);
  const [ignoradas, setIgnoradas] = React.useState<string[]>([]);
  const [resultado, setResultado] = React.useState<{ creados: Creado[]; omitidos: { busCode: string; motivo: string }[] } | null>(null);
  const [contactos, setContactos] = React.useState<Contacto[]>([]);
  const [notificarA, setNotificarA] = React.useState("");

  // Contactos del cliente a los que se les puede avisar el cierre.
  React.useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/users/assignable?context=cliente", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelado && res.ok) setContactos(Array.isArray(data?.items) ? data.items : []);
      } catch {
        /* si falla, el selector queda vacío y el campo es opcional */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const seleccionadas = filas?.filter((f) => f.incluir) ?? [];
  const totalCamaras = seleccionadas.reduce((n, f) => n + f.cameras.length, 0);

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setAviso(null);
    setResultado(null);
    try {
      const form = new FormData();
      if (archivo) form.append("file", archivo);
      if (texto.trim()) form.append("text", texto.trim());
      const res = await fetch("/api/novedades/import/parse", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudo analizar el reporte.");
        setIgnoradas(Array.isArray(data?.ignoradas) ? data.ignoradas : []);
        setFilas(null);
        return;
      }
      setAviso(data?.aviso ?? null);
      setIgnoradas(Array.isArray(data?.ignoradas) ? data.ignoradas : []);
      setFilas(
        (data.filas as FilaDetectada[]).map((f) => ({
          ...f,
          incluir: f.existeEnFlota,
          camerasText: textoDeCamaras(f.cameras),
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "No se pudo analizar el reporte.");
    } finally {
      setAnalizando(false);
    }
  }

  async function crear() {
    if (!seleccionadas.length) return;
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/novedades/import/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaReporte: fecha,
          notifyOnCloseUserId: notificarA || null,
          filas: seleccionadas.map((f) => ({
            busCode: f.busCode,
            busIp: f.busIp,
            camerasText: f.camerasText,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudieron crear las novedades.");
        return;
      }
      setResultado({ creados: data.creados ?? [], omitidos: data.omitidos ?? [] });
      setFilas(null);
    } catch (e: any) {
      setError(e?.message ?? "No se pudieron crear las novedades.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-3xl">
              Importar reporte de cámaras offline
            </h1>
            <p className="text-xs text-muted-foreground lg:text-sm">
              Genera una novedad por bus a partir del cuadro que envía el cliente.
            </p>
          </div>
          <Link className="sts-btn-ghost text-sm" href="/novedades">
            Volver a Novedades
          </Link>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl space-y-5 lg:px-6">
        <section className="sts-card p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ClipboardPaste className="h-3.5 w-3.5" />
                Pega aquí el cuadro (desde Excel o desde el correo)
              </label>
              <textarea
                className="mt-1 h-40 w-full rounded-md border p-2 font-mono text-xs focus-visible:outline-none"
                placeholder={"K1408\t172.23.22.221\tCamara BFE (172.16.4.36)\nK1427\t172.23.22.29\tCamara BTE (172.16.3.143)"}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Upload className="h-3.5 w-3.5" />
                  O carga el archivo (Excel, CSV o imagen)
                </label>
                <input
                  type="file"
                  accept="*/*"
                  className="mt-1 w-full text-xs"
                  onChange={(e) => setArchivo(e.currentTarget.files?.[0] ?? null)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  La imagen se lee con OCR: revisa las IPs antes de crear.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Fecha del reporte del cliente</label>
                <input
                  type="date"
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none"
                  value={fecha}
                  max={hoyEnColombia()}
                  onChange={(e) => setFecha(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Los tickets quedan con esta fecha, no con la de hoy.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Avisar el cierre a (opcional)
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none"
                  value={notificarA}
                  onChange={(e) => setNotificarA(e.target.value)}
                >
                  <option value="">Sin aviso</option>
                  {contactos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Contacto del cliente que recibirá el reporte cuando cada novedad se cierre. Se puede
                  cambiar después en cada caso.
                </p>
              </div>

              <button
                type="button"
                className="sts-btn-primary w-full text-sm disabled:opacity-60"
                disabled={analizando || (!texto.trim() && !archivo)}
                onClick={analizar}
              >
                {analizando ? "Analizando..." : "Analizar reporte"}
              </button>
            </div>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {aviso ? (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {aviso}
            </p>
          ) : null}
        </section>

        {filas ? (
          <section className="sts-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 p-5">
              <div>
                <h2 className="text-base font-semibold">Revisión</h2>
                <p className="text-xs text-muted-foreground">
                  {seleccionadas.length} bus(es) seleccionados · {totalCamaras} cámara(s). Corrige lo que haga falta antes de crear.
                </p>
              </div>
              <button
                type="button"
                className="sts-btn-primary text-sm disabled:opacity-60"
                disabled={creando || !seleccionadas.length}
                onClick={crear}
              >
                {creando ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creando...
                  </span>
                ) : (
                  `Crear ${seleccionadas.length} novedad(es)`
                )}
              </button>
            </div>

            <div className="space-y-3 p-5">
              {filas.map((f, i) => (
                <div
                  key={`${f.busCode}-${i}`}
                  className={`rounded-lg border p-3 ${f.incluir ? "border-border/60" : "border-dashed border-border/40 opacity-60"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={f.incluir}
                        disabled={!f.existeEnFlota}
                        onChange={(e) =>
                          setFilas((prev) =>
                            prev!.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x))
                          )
                        }
                      />
                      {f.busCode}
                      {f.placa ? <span className="text-xs text-muted-foreground">· {f.placa}</span> : null}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {f.cameras.length} cámara(s){f.busIp ? ` · bus ${f.busIp}` : ""}
                    </span>
                  </div>

                  <textarea
                    className="mt-2 w-full rounded-md border p-2 font-mono text-xs focus-visible:outline-none"
                    rows={2}
                    value={f.camerasText}
                    onChange={(e) =>
                      setFilas((prev) => prev!.map((x, j) => (j === i ? { ...x, camerasText: e.target.value } : x)))
                    }
                  />

                  {f.avisos.map((a, k) => (
                    <p key={k} className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {a}
                    </p>
                  ))}

                  {f.novedadesAbiertas.length ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Este bus ya tiene abierta:{" "}
                      {f.novedadesAbiertas
                        .map((n) => `CASO-${n.caseNo ?? "?"} (${n.status})`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}

              {ignoradas.length ? (
                <details className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Líneas que no se interpretaron ({ignoradas.length})</summary>
                  <ul className="mt-2 space-y-1 font-mono">
                    {ignoradas.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </section>
        ) : null}

        {resultado ? (
          <section className="sts-card p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Se crearon {resultado.creados.length} novedad(es)
            </h2>
            <ul className="mt-3 space-y-1 text-sm">
              {resultado.creados.map((c) => (
                <li key={c.caseId}>
                  <Link className="underline" href={`/cases/${c.caseId}`}>
                    CASO-{c.caseNo ?? "?"}
                  </Link>{" "}
                  · {c.busCode} · {c.camaras} cámara(s)
                </li>
              ))}
            </ul>
            {resultado.omitidos.length ? (
              <div className="mt-3 text-xs text-amber-700">
                <p className="font-medium">No se crearon:</p>
                <ul className="mt-1 space-y-1">
                  {resultado.omitidos.map((o, i) => (
                    <li key={i}>
                      {o.busCode}: {o.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Link className="sts-btn-primary mt-4 inline-block text-sm" href="/novedades">
              Ir a Novedades
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  );
}
