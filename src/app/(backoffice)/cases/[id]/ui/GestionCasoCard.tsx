"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, Replace, Trash2, Upload, Wand2, X } from "lucide-react";
import {
  PREVENTIVE_CHECKLIST,
  TIPO_NOVEDAD_SEVERITY,
  autoNotasOT,
  autoRecomendaciones,
  emptyChecklistData,
  summarizeChecklist,
  type ChecklistData,
  type ChecklistItemValue,
  type ChecklistSectionDef,
  type CheckState,
  type Severity,
  type TipoNovedad,
} from "@/lib/preventive/checklist-template";

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
  initialChecklist?: ChecklistData | null;
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

// Botón compacto de estado (OK / Hallazgo / N/A) para los ítems del checklist.
const Tri = ({ active, tone, onClick, children }: { active: boolean; tone: "ok" | "bad" | "muted"; onClick: () => void; children: React.ReactNode }) => {
  const on =
    tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : tone === "bad" ? "border-red-300 bg-red-50 text-red-700"
    : "border-slate-300 bg-slate-100 text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${active ? on : "border-border/60 bg-white text-slate-400 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
};

export default function GestionCasoCard(props: Props) {
  const router = useRouter();
  const isPrev = props.caseType === "PREVENTIVO";

  const [persona, setPersona] = useState(props.currentAssignedId ?? "");
  const [ot, setOt] = useState<"" | "si" | "pend">("");
  const [otNota, setOtNota] = useState("");
  const [otFile, setOtFile] = useState<File | null>(null);
  const [evidencias, setEvidencias] = useState<File[]>([]);

  // Checklist estructurado del preventivo.
  const [checklist, setChecklist] = useState<ChecklistData>(() => props.initialChecklist ?? emptyChecklistData());
  const [itemPhotos, setItemPhotos] = useState<Record<string, File>>({});
  const [openSecs, setOpenSecs] = useState<Set<string>>(() => new Set(PREVENTIVE_CHECKLIST[0] ? [PREVENTIVE_CHECKLIST[0].id] : []));

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
  const summary = useMemo(() => summarizeChecklist(checklist), [checklist]);

  const CAUSAS = [
    "NVR no reporta al centro de gestión",
    "NVR sin grabación",
    "Firmware desactualizado",
    "Falla tras actualización de firmware",
    "Aplicación no responde",
    "Parámetros / configuración perdida",
    "Sin sincronización con CMS",
  ];

  // -------- helpers del checklist --------
  function setItem(sectionId: string, itemId: string, patch: Partial<ChecklistItemValue>) {
    setChecklist((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [sectionId]: { ...prev.items[sectionId], [itemId]: { ...prev.items[sectionId]?.[itemId], ...patch } },
      },
    }));
  }
  function setPhoto(sectionId: string, itemId: string, file: File | null) {
    const key = `${sectionId}::${itemId}`;
    setItemPhotos((prev) => {
      const n = { ...prev };
      if (file) n[key] = file;
      else delete n[key];
      return n;
    });
    setItem(sectionId, itemId, { photo: file ? { filePath: "", fileName: file.name, mimeType: file.type, size: file.size } : null });
  }
  function setCierre(patch: Partial<ChecklistData["cierre"]>) {
    setChecklist((prev) => ({ ...prev, cierre: { ...prev.cierre, ...patch } }));
  }
  function addHallazgo() {
    setChecklist((prev) => ({ ...prev, cierre: { ...prev.cierre, hallazgos: [...prev.cierre.hallazgos, { severity: "M" as Severity, equipoId: null, equipo: "", tipoNovedad: null, cambioEquipo: false, descripcion: "" }] } }));
  }
  function updHallazgo(i: number, patch: Partial<ChecklistData["cierre"]["hallazgos"][number]>) {
    setChecklist((prev) => ({ ...prev, cierre: { ...prev.cierre, hallazgos: prev.cierre.hallazgos.map((h, j) => (j === i ? { ...h, ...patch } : h)) } }));
  }
  function delHallazgo(i: number) {
    setChecklist((prev) => ({ ...prev, cierre: { ...prev.cierre, hallazgos: prev.cierre.hallazgos.filter((_, j) => j !== i) } }));
  }
  function toggleSec(id: string) {
    setOpenSecs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function sectionProgress(section: ChecklistSectionDef): string {
    const total = section.items.length;
    let filled = 0;
    for (const it of section.items) {
      const v = checklist.items[section.id]?.[it.id];
      if (it.type === "check") {
        if (v?.estado) filled++;
      } else if (it.type === "photo") {
        if (itemPhotos[`${section.id}::${it.id}`] || v?.photo?.filePath) filled++;
      } else if ((v?.value ?? "").trim()) filled++;
    }
    return `${filled}/${total}`;
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
        // Enviamos el checklist completo (sin binarios) + fotos por ítem aparte.
        fd.set("checklist", JSON.stringify(checklist));
        fd.set("resultado", summary.conNovedad ? "con" : "sin");
        fd.set("observacion", checklist.cierre.notasOT);
        fd.set("generarCorrectivo", checklist.cierre.requiereCorrectivo ? "1" : "0");
        const eq = checklist.cierre.hallazgos
          .filter((h) => h.equipoId)
          .map((h) => ({ id: h.equipoId as string, name: props.busEquipments.find((e) => e.id === h.equipoId)?.name ?? h.equipo ?? "" }));
        fd.set("equipos", JSON.stringify(eq));
        for (const [key, file] of Object.entries(itemPhotos)) {
          fd.append(`item_photo::${key}`, file);
        }
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
      const cert = data?.certificado ? " Certificado generado y adjuntado." : "";
      setMsg((sk.length ? `${okMsg} No se pudieron subir: ${sk.join(", ")}.` : okMsg) + cert);
      setOtFile(null);
      setEvidencias([]);
      setSerialFoto(null);
      setItemPhotos({});
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

  // -------- renderers de ítems del checklist --------
  const renderCheckItem = (sectionId: string, it: ChecklistSectionDef["items"][number]) => {
    const v: ChecklistItemValue = checklist.items[sectionId]?.[it.id] ?? {};
    return (
      <div key={it.id} className="rounded-lg border border-border/60 bg-white p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-slate-700">{it.label}</span>
          <div className="flex shrink-0 gap-1">
            <Tri active={v.estado === "ok"} tone="ok" onClick={() => setItem(sectionId, it.id, { estado: "ok" })}>OK</Tri>
            <Tri active={v.estado === "hallazgo"} tone="bad" onClick={() => setItem(sectionId, it.id, { estado: "hallazgo" as CheckState })}>Hallazgo</Tri>
            <Tri active={v.estado === "na"} tone="muted" onClick={() => setItem(sectionId, it.id, { estado: "na" })}>N/A</Tri>
          </div>
        </div>
        {v.estado === "hallazgo" ? (
          <input
            value={v.nota ?? ""}
            onChange={(e) => setItem(sectionId, it.id, { nota: e.target.value })}
            placeholder="¿Qué se encontró?"
            className="app-field-control mt-2 h-8 w-full rounded-lg px-2 text-[13px]"
          />
        ) : null}
      </div>
    );
  };

  const renderVoltItem = (sectionId: string, it: ChecklistSectionDef["items"][number]) => {
    const v: ChecklistItemValue = checklist.items[sectionId]?.[it.id] ?? {};
    return (
      <div key={it.id} className="flex items-center gap-2">
        <span className="flex-1 text-[13px] text-slate-700">{it.label}</span>
        <input
          value={v.value ?? ""}
          onChange={(e) => setItem(sectionId, it.id, { value: e.target.value })}
          placeholder="0.0"
          inputMode="decimal"
          className="app-field-control h-8 w-20 rounded-lg px-2 text-center text-[13px]"
        />
        <span className="text-[11px] text-slate-400">V</span>
      </div>
    );
  };

  const renderPhotoItem = (sectionId: string, it: ChecklistSectionDef["items"][number]) => {
    const key = `${sectionId}::${it.id}`;
    const v: ChecklistItemValue = checklist.items[sectionId]?.[it.id] ?? {};
    const file = itemPhotos[key];
    const has = Boolean(file) || Boolean(v.photo?.filePath);
    const fname = file?.name || v.photo?.fileName || "";
    return (
      <div key={it.id} className="flex items-center gap-2">
        <span className="flex-1 truncate text-[13px] text-slate-700">{it.label}</span>
        {has ? (
          <span className="flex items-center gap-1 text-[11px] text-emerald-700">
            <span className="max-w-[110px] truncate">{fname || "adjunta"}</span>
            <button type="button" onClick={() => setPhoto(sectionId, it.id, null)} className="text-slate-400 hover:text-red-600" title="Quitar"><X className="h-3 w-3" /></button>
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">pendiente</span>
        )}
        <label className="flex cursor-pointer items-center" title={`Subir ${it.label}`}>
          <Upload className={`h-4 w-4 ${has ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"}`} />
          <input type="file" accept="*/*" className="hidden" onChange={(e) => setPhoto(sectionId, it.id, e.target.files?.[0] ?? null)} />
        </label>
      </div>
    );
  };

  const renderTextItem = (sectionId: string, it: ChecklistSectionDef["items"][number]) => {
    const v: ChecklistItemValue = checklist.items[sectionId]?.[it.id] ?? {};
    return (
      <div key={it.id} className="flex items-center gap-2">
        <span className="w-40 shrink-0 text-[13px] text-slate-600">{it.label}</span>
        <input
          value={v.value ?? ""}
          onChange={(e) => setItem(sectionId, it.id, { value: e.target.value })}
          placeholder={it.hint ?? ""}
          className="app-field-control h-8 flex-1 rounded-lg px-2 text-[13px]"
        />
      </div>
    );
  };

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

        {/* PREVENTIVO — checklist estructurado */}
        {isPrev ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`${label} mb-0`}>Checklist del preventivo</span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">OK {summary.okCount}/{summary.applicable}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${summary.hallazgoCount ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>Hallazgo {summary.hallazgoCount}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">Pendientes {summary.pendientes}</span>
              </div>
            </div>

            {PREVENTIVE_CHECKLIST.map((section) => {
              const open = openSecs.has(section.id);
              return (
                <div key={section.id} className="overflow-hidden rounded-lg border border-border/70">
                  <button type="button" onClick={() => toggleSec(section.id)} className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 hover:bg-slate-100">
                    <span className="text-[13px] font-medium text-slate-700">{section.title}</span>
                    <span className="flex items-center gap-2 text-[11px] text-slate-400">
                      {sectionProgress(section)}
                      <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {open ? (
                    <div className="space-y-2 p-3">
                      {section.items.map((it) =>
                        it.type === "voltage" ? renderVoltItem(section.id, it)
                        : it.type === "photo" ? renderPhotoItem(section.id, it)
                        : it.type === "text" ? renderTextItem(section.id, it)
                        : renderCheckItem(section.id, it)
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* Cierre */}
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <span className={`${label} mb-0`}>Cierre — hallazgos y recomendaciones</span>

              {checklist.cierre.hallazgos.length ? (
                <div className="space-y-2">
                  {checklist.cierre.hallazgos.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-white p-2">
                      <select value={h.tipoNovedad ?? ""} onChange={(e) => { const t = e.target.value as TipoNovedad; updHallazgo(i, { tipoNovedad: t || null, severity: t ? TIPO_NOVEDAD_SEVERITY[t] : h.severity }); }} className="app-field-control h-8 rounded-lg px-2 text-[13px]">
                        <option value="">Tipo de novedad…</option>
                        <option value="sin_transmision">Sin transmisión</option>
                        <option value="falla_imagen">Falla en imagen</option>
                        <option value="afectado">Afectado</option>
                      </select>
                      <select
                        value={h.equipoId ?? ""}
                        onChange={(e) => updHallazgo(i, { equipoId: e.target.value || null, equipo: props.busEquipments.find((x) => x.id === e.target.value)?.name ?? "" })}
                        className="app-field-control h-8 rounded-lg px-2 text-[13px]"
                      >
                        <option value="">Equipo…</option>
                        {props.busEquipments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                      <input value={h.descripcion} onChange={(e) => updHallazgo(i, { descripcion: e.target.value })} placeholder="Detalle (opcional)" className="app-field-control h-8 min-w-[120px] flex-1 rounded-lg px-2 text-[13px]" />
                      <label className="flex items-center gap-1 text-[12px] text-slate-600"><input type="checkbox" checked={Boolean(h.cambioEquipo)} onChange={(e) => updHallazgo(i, { cambioEquipo: e.target.checked })} /> Cambio equipo</label>
                      <button type="button" onClick={() => delHallazgo(i)} className="text-slate-300 hover:text-red-600" title="Quitar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-slate-500">Sin hallazgos. Si todo quedó OK, no agregues ninguno.</p>
              )}
              <button type="button" onClick={addHallazgo} className="sts-btn-ghost inline-flex h-8 items-center gap-1.5 px-3 text-[13px]">
                <Plus className="h-3.5 w-3.5" /> Agregar hallazgo
              </button>

              <div>
                <span className={label}>¿Requiere correctivo?</span>
                <div className="flex gap-2">
                  <OptBtn active={checklist.cierre.requiereCorrectivo} onClick={() => setCierre({ requiereCorrectivo: true })}>Sí, crear correctivo</OptBtn>
                  <OptBtn active={!checklist.cierre.requiereCorrectivo} onClick={() => setCierre({ requiereCorrectivo: false })}>No</OptBtn>
                </div>
                {checklist.cierre.requiereCorrectivo ? <p className="mt-1 text-[11px] text-muted-foreground">Al resolver se crea el correctivo asociado (bus, equipos de los hallazgos y la misma persona).</p> : null}
              </div>

              <button
                type="button"
                onClick={() => setCierre({ recomendaciones: autoRecomendaciones(checklist), notasOT: autoNotasOT(checklist, props.busCode) })}
                className="sts-btn-ghost inline-flex h-8 w-fit items-center gap-1.5 px-3 text-[13px]"
                title="Arma el texto según los hallazgos; luego lo puedes editar"
              >
                <Wand2 className="h-3.5 w-3.5" /> Generar recomendaciones y notas
              </button>
              <div>
                <span className={label}>Recomendaciones</span>
                <textarea value={checklist.cierre.recomendaciones} onChange={(e) => setCierre({ recomendaciones: e.target.value })} rows={2} placeholder="(vacío = se genera automático en el certificado)" className="app-field-control w-full rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <span className={label}>Notas para OT de Capital</span>
                <textarea value={checklist.cierre.notasOT} onChange={(e) => setCierre({ notasOT: e.target.value })} rows={2} placeholder="Resumen breve para la OT (ej.: se realiza mantenimiento preventivo con las siguientes novedades…)" className="app-field-control w-full rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
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
            <Check className="h-4 w-4" /> {isPrev ? "Cerrar y generar certificado" : "Resolver caso"}
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
