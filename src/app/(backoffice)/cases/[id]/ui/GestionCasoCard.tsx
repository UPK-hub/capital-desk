"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Replace, Upload, X } from "lucide-react";

// Sube un FormData con barra de progreso, tiempo límite y errores claros
// (evita el "spinner infinito" cuando el archivo es pesado, p. ej. videos).
function postFormWithProgress(
  url: string,
  fd: FormData,
  onProgress: (pct: number) => void
): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 15 * 60 * 1000; // 15 minutos
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Error de red al subir los archivos. Revisa tu conexión e intenta de nuevo."));
    xhr.ontimeout = () => reject(new Error("La subida tardó demasiado. Intenta con archivos más livianos o con mejor conexión."));
    xhr.send(fd);
  });
}

type Tecnico = { id: string; name: string };
type Equipo = { id: string; name: string; serial: string | null };

type Props = {
  caseId: string;
  caseType: "PREVENTIVO" | "CORRECTIVO";
  busCode: string | null;
  busPlate: string | null;
  canManage: boolean;
  technicians: Tecnico[];
  busEquipments: Equipo[];
  currentAssignedId: string | null;
  currentAssignedName: string | null;
  currentStatus: string;
};

const OptBtn = ({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg border px-3 py-2 text-left text-[13px] transition disabled:opacity-50 ${
      active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-border/70 bg-white text-slate-600 hover:bg-slate-50"
    }`}
  >
    {children}
  </button>
);

export default function GestionCasoCard(props: Props) {
  const router = useRouter();
  const isPrev = props.caseType === "PREVENTIVO";

  const [persona, setPersona] = useState(props.currentAssignedId ?? "");
  const [ot, setOt] = useState<"" | "si" | "pend">("");
  const [otNota, setOtNota] = useState("");
  const [otFile, setOtFile] = useState<File | null>(null);
  const [evidencias, setEvidencias] = useState<File[]>([]);

  const [resultado, setResultado] = useState<"" | "sin" | "con">("");
  const [equipos, setEquipos] = useState<Set<string>>(new Set());
  const [observacion, setObservacion] = useState("");
  const [generar, setGenerar] = useState<"" | "si" | "no">("");

  const [tipoCorr, setTipoCorr] = useState<"" | "fisico" | "firmware" | "software">("");
  const [diagnostico, setDiagnostico] = useState("");
  const [causa, setCausa] = useState("");
  const [causaLibre, setCausaLibre] = useState("");
  const [cambio, setCambio] = useState<"" | "si" | "no">("");
  const [cEquipoId, setCEquipoId] = useState("");
  const [cAnt, setCAnt] = useState("");
  const [cNue, setCNue] = useState("");
  const [cMM, setCMM] = useState("");
  const [serialFoto, setSerialFoto] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const evidRef = useRef<HTMLInputElement>(null);

  const needsOT = isPrev || tipoCorr === "fisico";
  const personaName = useMemo(() => props.technicians.find((t) => t.id === persona)?.name ?? props.currentAssignedName ?? "", [persona, props.technicians, props.currentAssignedName]);

  const CAUSAS = [
    "NVR no reporta al centro de gestión",
    "NVR sin grabación",
    "Firmware desactualizado",
    "Falla tras actualización de firmware",
    "Aplicación no responde",
    "Parámetros / configuración perdida",
    "Sin sincronización con CMS",
  ];

  function toggleEquipo(id: string) {
    setEquipos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit(resolver: boolean) {
    setErr(null);
    setMsg(null);
    if (needsOT && !ot) {
      setErr("Falta la OT del cliente: adjúntala o márcala como pendiente.");
      return;
    }
    if (!isPrev && cambio === "si" && !cNue.trim()) {
      setErr("Indica el serial del equipo nuevo para actualizar la hoja de vida.");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      if (persona) {
        fd.set("personaId", persona);
        fd.set("personaName", personaName);
      }
      fd.set("ot", needsOT ? ot : "");
      fd.set("otNota", otNota);
      if (ot === "si" && otFile) fd.set("otFile", otFile);
      for (const f of evidencias) fd.append("evidencias", f);
      fd.set("resolver", resolver ? "1" : "0");

      if (isPrev) {
        fd.set("resultado", resultado);
        fd.set("observacion", observacion);
        fd.set("generarCorrectivo", resultado === "con" && generar === "si" ? "1" : "0");
        const eq = Array.from(equipos).map((id) => ({ id, name: props.busEquipments.find((e) => e.id === id)?.name ?? "" }));
        fd.set("equipos", JSON.stringify(eq));
      } else {
        fd.set("tipoCorr", tipoCorr);
        fd.set("diagnostico", diagnostico);
        fd.set("causa", causa);
        fd.set("causaLibre", causaLibre);
        fd.set("cambio", cambio === "si" ? "1" : "0");
        if (cambio === "si") {
          fd.set("cEquipoId", cEquipoId);
          fd.set("cEquipoName", props.busEquipments.find((e) => e.id === cEquipoId)?.name ?? "");
          fd.set("cAnt", cAnt);
          fd.set("cNue", cNue);
          fd.set("cMM", cMM);
          if (serialFoto) fd.set("serialFoto", serialFoto);
        }
      }

      setProgress(0);
      const { ok, status, data } = await postFormWithProgress(`/api/cases/${props.caseId}/gestion`, fd, setProgress);
      if (!ok) throw new Error(data?.error ?? `No se pudo guardar la gestión (HTTP ${status}).`);
      const okMsg = resolver ? "Caso resuelto." : "Gestión guardada.";
      const sk: string[] = Array.isArray(data?.skipped) ? data.skipped : [];
      setMsg(sk.length ? `${okMsg} No se pudieron subir: ${sk.join(", ")}.` : okMsg);
      setOtFile(null);
      setEvidencias([]);
      setSerialFoto(null);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
      setProgress(0);
    }
  }

  if (!props.canManage) return null;

  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400";
  const field = "app-field-control h-9 w-full rounded-lg px-3 text-sm";

  return (
    <section className="sts-card overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Gestionar caso</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {isPrev ? "Preventivo" : "Correctivo"} · {props.busCode ?? "bus"}
          {props.busPlate ? ` · ${props.busPlate}` : ""}
        </p>
      </div>

      <div className="space-y-4 p-5">
        {/* Correctivo: tipo */}
        {!isPrev ? (
          <div>
            <span className={label}>Tipo de correctivo</span>
            <div className="grid grid-cols-3 gap-2">
              <OptBtn active={tipoCorr === "fisico"} onClick={() => setTipoCorr("fisico")}>Físico</OptBtn>
              <OptBtn active={tipoCorr === "firmware"} onClick={() => setTipoCorr("firmware")}>Firmware</OptBtn>
              <OptBtn active={tipoCorr === "software"} onClick={() => setTipoCorr("software")}>Software</OptBtn>
            </div>
          </div>
        ) : null}

        {/* OT del cliente */}
        {needsOT ? (
          <div>
            <span className={label}>OT del cliente · obligatoria</span>
            <div className="flex gap-2">
              <OptBtn active={ot === "si"} onClick={() => setOt("si")}>Adjuntar OT</OptBtn>
              <OptBtn active={ot === "pend"} onClick={() => setOt("pend")}>Pendiente por cargar</OptBtn>
            </div>
            {ot === "si" ? (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <Upload className="h-3.5 w-3.5" />
                <input type="file" accept="*/*" className="text-xs" onChange={(e) => setOtFile(e.target.files?.[0] ?? null)} />
                {otFile ? <span className="text-emerald-700">{otFile.name}</span> : <span>Selecciona el PDF (cualquier peso)</span>}
              </label>
            ) : null}
            {ot === "pend" ? (
              <textarea value={otNota} onChange={(e) => setOtNota(e.target.value)} rows={2} placeholder="Nota: por qué queda pendiente" className="app-field-control mt-2 w-full rounded-lg px-3 py-2 text-sm" />
            ) : null}
          </div>
        ) : null}

        {/* Persona que ejecutó */}
        <div>
          <span className={label}>Persona que ejecutó</span>
          <select value={persona} onChange={(e) => setPersona(e.target.value)} className={field}>
            <option value="">Seleccionar…</option>
            {props.technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">Queda como responsable del caso.</p>
        </div>

        {/* Evidencias */}
        <div>
          <span className={label}>Evidencias (fotos, videos, archivos)</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => evidRef.current?.click()} className="sts-btn-ghost inline-flex h-9 items-center gap-1.5 px-3 text-sm">
              <Upload className="h-4 w-4" /> Agregar
            </button>
            <span className="text-xs text-muted-foreground">{evidencias.length ? `${evidencias.length} archivo(s)` : "Sin evidencias"}</span>
            <input ref={evidRef} type="file" multiple className="hidden" onChange={(e) => { setEvidencias((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
          </div>
          {evidencias.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {evidencias.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                  {f.name}
                  <button type="button" onClick={() => setEvidencias((p) => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* PREVENTIVO */}
        {isPrev ? (
          <>
            <div>
              <span className={label}>Resultado del mantenimiento</span>
              <div className="flex gap-2">
                <OptBtn active={resultado === "sin"} onClick={() => setResultado("sin")}>Sin novedad</OptBtn>
                <OptBtn active={resultado === "con"} onClick={() => setResultado("con")}>Con novedad de falla</OptBtn>
              </div>
            </div>
            {resultado === "con" ? (
              <>
                <div>
                  <span className={label}>Equipos con falla</span>
                  {props.busEquipments.length ? (
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {props.busEquipments.map((e) => (
                        <label key={e.id} className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" checked={equipos.has(e.id)} onChange={() => toggleEquipo(e.id)} />
                          {e.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Este bus no tiene equipos registrados en su hoja de vida.</p>
                  )}
                  <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} placeholder="Observación" className="app-field-control mt-2 w-full rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <span className={label}>¿Generar correctivo?</span>
                  <div className="flex gap-2">
                    <OptBtn active={generar === "si"} onClick={() => setGenerar("si")}>Sí, crear correctivo</OptBtn>
                    <OptBtn active={generar === "no"} onClick={() => setGenerar("no")}>No</OptBtn>
                  </div>
                  {generar === "si" ? <p className="mt-1 text-[11px] text-muted-foreground">Se crea asociado, con bus, equipos marcados y la misma persona.</p> : null}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {/* CORRECTIVO body */}
        {!isPrev && tipoCorr ? (
          <>
            {tipoCorr === "fisico" ? (
              <div>
                <span className={label}>Diagnóstico / solución</span>
                <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={2} placeholder="Qué se hizo" className="app-field-control w-full rounded-lg px-3 py-2 text-sm" />
              </div>
            ) : (
              <div>
                <p className="mb-2 text-[11px] text-muted-foreground">Firmware o software no requiere OT del cliente.</p>
                <span className={label}>Causa raíz (catálogo de novedades)</span>
                <select value={causa} onChange={(e) => setCausa(e.target.value)} className={field}>
                  <option value="">Seleccionar…</option>
                  {CAUSAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={causaLibre} onChange={(e) => setCausaLibre(e.target.value)} rows={2} placeholder="Detalle (texto libre)" className="app-field-control mt-2 w-full rounded-lg px-3 py-2 text-sm" />
              </div>
            )}

            <div>
              <span className={label}><Replace className="mr-1 inline h-3.5 w-3.5" />¿Hubo cambio de equipo?</span>
              <div className="flex gap-2">
                <OptBtn active={cambio === "si"} onClick={() => setCambio("si")}>Sí</OptBtn>
                <OptBtn active={cambio === "no"} onClick={() => setCambio("no")}>No</OptBtn>
              </div>
              {cambio === "si" ? (
                <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <select
                    value={cEquipoId}
                    onChange={(e) => { setCEquipoId(e.target.value); setCAnt(props.busEquipments.find((x) => x.id === e.target.value)?.serial ?? ""); }}
                    className={field}
                  >
                    <option value="">Equipo que cambió…</option>
                    {props.busEquipments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input value={cAnt} onChange={(e) => setCAnt(e.target.value)} placeholder="Serial anterior" className={field} />
                    <input value={cNue} onChange={(e) => setCNue(e.target.value)} placeholder="Serial nuevo *" className={field} />
                    <input value={cMM} onChange={(e) => setCMM(e.target.value)} placeholder="Marca / modelo (opcional)" className={`${field} sm:col-span-2`} />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <Upload className="h-3.5 w-3.5" />
                    <input type="file" accept="*/*" className="text-xs" onChange={(e) => setSerialFoto(e.target.files?.[0] ?? null)} />
                    {serialFoto ? <span className="text-emerald-700">{serialFoto.name}</span> : <span>Foto del serial nuevo</span>}
                  </label>
                  <p className="text-[11px] text-muted-foreground">Actualiza la hoja de vida del bus y registra el movimiento en el histórico.</p>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <button type="button" onClick={() => void submit(false)} disabled={saving} className="sts-btn-ghost inline-flex h-9 items-center justify-center px-4 text-sm disabled:opacity-60">
            {saving ? (progress > 0 && progress < 100 ? `Subiendo ${progress}%` : "Guardando…") : "Guardar avance"}
          </button>
          <button type="button" onClick={() => void submit(true)} disabled={saving} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-60">
            <Check className="h-4 w-4" /> Resolver caso
          </button>
        </div>

        {saving && progress > 0 && progress < 100 ? <p className="text-xs text-blue-600">Subiendo archivos… {progress}%</p> : null}
        {saving && progress >= 100 ? <p className="text-xs text-blue-600">Procesando en el servidor…</p> : null}
        {msg ? <p className="text-xs text-green-700">{msg}</p> : null}
        {err ? <p className="text-xs text-red-600">{err}</p> : null}
      </div>
    </section>
  );
}
