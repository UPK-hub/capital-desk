"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { FormCard } from "@/components/FormCard";
import { Field, Input, Select, Textarea } from "@/components/Field";
import { DateTimeField } from "@/components/DateTimeField";
import { BusCombobox } from "@/components/BusCombobox";
import { BusEquipmentSelect } from "@/components/BusEquipmentSelect";
import { BusEquipmentMultiSelect } from "@/components/BusEquipmentMultiSelect";
import { StsTicketSeverity } from "@prisma/client";
type BusOption = { id: string; code: string; plate: string | null };

type VideoForm = {
  origin: "TRANSMILENIO_SA" | "INTERVENTORIA" | "CAPITAL_BUS" | "OTRO";
  originOther?: string | null;

  requestType: string;
  radicadoTMSA: string;
  radicadoTMSADate: string;

  radicadoConcesionarioDate: string;

  requesterName: string;
  requesterDocument: string;
  requesterRole: string;
  requesterPhone: string;
  requesterEmail: string;
  requesterEmails: string[];

  vehicleId: string;

  eventStartAt: string;
  eventEndAt: string;

  cameras: string;
  deliveryMethod: "WINSCP" | "USB" | "ONEDRIVE";

  descriptionNovedad: string;
  finSolicitud: string[];
};

export default function NewCasePage() {
  const router = useRouter();

  const [type, setType] = useState<keyof typeof CASE_TYPE_REGISTRY>("CORRECTIVO");
  const config = CASE_TYPE_REGISTRY[type];

  const [bus, setBus] = useState<BusOption | null>(null);
  const [busEquipmentIds, setBusEquipmentIds] = useState<string[]>([]);

  const suggested = useMemo(() => {
    const busCode = bus?.code;
    return {
      title: config.defaultTitle(busCode),
      description: config.defaultDescription(busCode),
    };
  }, [bus?.code, config]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"BAJA" | "MEDIA" | "ALTA">("MEDIA");
  const [stsSeverity, setStsSeverity] = useState<StsTicketSeverity>(StsTicketSeverity.MEDIUM);

  const effectiveTitle = title || suggested.title;
  const effectiveDescription = description || suggested.description;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [video, setVideo] = useState<VideoForm>({
    origin: "TRANSMILENIO_SA",
    originOther: null,
    requestType: "",
    radicadoTMSA: "",
    radicadoTMSADate: "",
    radicadoConcesionarioDate: "",
    requesterName: "",
    requesterDocument: "",
    requesterRole: "",
    requesterPhone: "",
    requesterEmail: "",
    requesterEmails: ["", "", ""],
    vehicleId: "",
    eventStartAt: "",
    eventEndAt: "",
    cameras: "",
    deliveryMethod: "WINSCP",
    descriptionNovedad: "",
    finSolicitud: [],
  });

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      if (!bus?.id) throw new Error("Debes seleccionar un bus.");
      if (config.requiresEquipment && !busEquipmentIds.length) {
        throw new Error("Debes seleccionar al menos un equipo del bus.");
      }

      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          busId: bus.id,
          busEquipmentIds,
          title: effectiveTitle,
          description: effectiveDescription,
          priority,
          stsSeverity: config.stsComponentCode ? stsSeverity : undefined,
          // inline create form
          videoDownloadRequest: config.hasInlineCreateForm ? video : undefined,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      const created = await res.json();
      router.push(`/cases/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error creando caso");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Crear caso</h1>
        <p className="text-sm text-muted-foreground">
          Flujo unificado basado en registry. Buscado rápido por código o placa.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      <FormCard
        title="Datos del caso"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => router.push("/cases")}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Crear caso"}
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tipo de caso">
            <Select
              value={type}
              onChange={(e) => {
                const v = e.target.value as any;
                setType(v);
                setBusEquipmentIds([]);
              }}
            >
              {Object.values(CASE_TYPE_REGISTRY).map((c) => (
                <option key={c.type} value={c.type}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prioridad">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
            </Select>
          </Field>

          {config.stsComponentCode ? (
            <Field label="Severidad STS">
              <Select value={stsSeverity} onChange={(e) => setStsSeverity(e.target.value as any)}>
                <option value={StsTicketSeverity.EMERGENCY}>Emergencia</option>
                <option value={StsTicketSeverity.HIGH}>Alto</option>
                <option value={StsTicketSeverity.MEDIUM}>Medio</option>
                <option value={StsTicketSeverity.LOW}>Bajo</option>
              </Select>
            </Field>
          ) : null}

          <Field label="Bus (código o placa)">
            <BusCombobox
              value={bus}
              onChange={(b) => {
                setBus(b);
                setBusEquipmentIds([]);
                // para video request: autollenar vehicleId con code si quieren
                if (b?.code) setVideo((x) => ({ ...x, vehicleId: x.vehicleId || b.code }));
              }}
            />
          </Field>

          <Field label="Equipo(s) del bus" hint={config.requiresEquipment ? "Requerido" : "Opcional"}>
            {type === "PREVENTIVO" ? (
              <BusEquipmentMultiSelect
                busId={bus?.id ?? null}
                value={busEquipmentIds}
                onChange={setBusEquipmentIds}
                disabled={!bus?.id}
              />
            ) : (
              <BusEquipmentSelect
                busId={bus?.id ?? null}
                value={busEquipmentIds[0] ?? null}
                onChange={(id) => setBusEquipmentIds(id ? [id] : [])}
                disabled={!bus?.id}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título" hint="Autollenado por tipo, editable">
            <Input value={effectiveTitle} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Descripción" hint="Autollenado por tipo, editable">
            <Textarea rows={3} value={effectiveDescription} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </FormCard>

      {config.hasInlineCreateForm ? (
        <FormCard title="Formulario solicitud descarga de video">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Procedencia requerimiento">
              <Select
                value={video.origin}
                onChange={(e) => setVideo((x) => ({ ...x, origin: e.target.value as any }))}
              >
                <option value="TRANSMILENIO_SA">TRANSMILENIO S.A</option>
                <option value="INTERVENTORIA">Interventoría</option>
                <option value="CAPITAL_BUS">Capital Bus</option>
                <option value="OTRO">Otro</option>
              </Select>
            </Field>

            <Field label="Otro (si aplica)">
              <Input
                value={video.originOther ?? ""}
                onChange={(e) => setVideo((x) => ({ ...x, originOther: e.target.value }))}
                disabled={video.origin !== "OTRO"}
              />
            </Field>

            <Field label="Tipo de requerimiento">
              <Input value={video.requestType} onChange={(e) => setVideo((x) => ({ ...x, requestType: e.target.value }))} />
            </Field>

            <Field label="Radicado TMSA">
              <Input value={video.radicadoTMSA} onChange={(e) => setVideo((x) => ({ ...x, radicadoTMSA: e.target.value }))} />
            </Field>

            <Field label="Fecha radicado TMSA">
              <DateTimeField value={video.radicadoTMSADate} onChange={(v) => setVideo((x) => ({ ...x, radicadoTMSADate: v }))} />
            </Field>

            <Field label="Fecha radicado Concesionario">
              <DateTimeField
                value={video.radicadoConcesionarioDate}
                onChange={(v) => setVideo((x) => ({ ...x, radicadoConcesionarioDate: v }))}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Solicitante - Nombre">
              <Input value={video.requesterName} onChange={(e) => setVideo((x) => ({ ...x, requesterName: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Documento">
              <Input value={video.requesterDocument} onChange={(e) => setVideo((x) => ({ ...x, requesterDocument: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Cargo">
              <Input value={video.requesterRole} onChange={(e) => setVideo((x) => ({ ...x, requesterRole: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Teléfono">
              <Input value={video.requesterPhone} onChange={(e) => setVideo((x) => ({ ...x, requesterPhone: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Email">
              <Input value={video.requesterEmail} onChange={(e) => setVideo((x) => ({ ...x, requesterEmail: e.target.value }))} />
            </Field>
            <Field label="Correos para envio (1 a 3)">
              <div className="space-y-2">
                {video.requesterEmails.map((email, idx) => (
                  <Input
                    key={idx}
                    value={email}
                    placeholder={`Correo ${idx + 1}`}
                    onChange={(e) =>
                      setVideo((x) => {
                        const next = [...x.requesterEmails];
                        next[idx] = e.target.value;
                        return { ...x, requesterEmails: next };
                      })
                    }
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Usa solo los correos necesarios, máximo 3.</p>
            </Field>
            <Field label="ID Vehículo">
              <Input value={video.vehicleId} onChange={(e) => setVideo((x) => ({ ...x, vehicleId: e.target.value }))} />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fecha/hora evento inicio">
              <DateTimeField value={video.eventStartAt} onChange={(v) => setVideo((x) => ({ ...x, eventStartAt: v }))} />
            </Field>
            <Field label="Fecha/hora evento fin">
              <DateTimeField value={video.eventEndAt} onChange={(v) => setVideo((x) => ({ ...x, eventEndAt: v }))} />
            </Field>

            <Field label="Cámaras solicitadas">
              <Input value={video.cameras} onChange={(e) => setVideo((x) => ({ ...x, cameras: e.target.value }))} />
            </Field>

            <Field label="Medio de entrega">
              <Select
                value={video.deliveryMethod}
                onChange={(e) => setVideo((x) => ({ ...x, deliveryMethod: e.target.value as any }))}
              >
                <option value="WINSCP">WinSCP</option>
                <option value="USB">USB</option>
                <option value="ONEDRIVE">OneDrive</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Descripción novedad">
              <Textarea
                rows={3}
                value={video.descriptionNovedad}
                onChange={(e) => setVideo((x) => ({ ...x, descriptionNovedad: e.target.value }))}
              />
            </Field>
            <Field label="Fin solicitud (separa con ; si hay varias)">
              <Textarea
                rows={3}
                value={video.finSolicitud.join("; ")}
                onChange={(e) =>
                  setVideo((x) => ({
                    ...x,
                    finSolicitud: e.target.value
                      .split(";")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </Field>
          </div>
        </FormCard>
      ) : null}
    </div>
  );
}
