"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const FormSchema = z.object({
  ticketNumber: z.string().trim().min(1, "Número de ticket requerido"),
  workOrderNumber: z.string().trim().optional().nullable(),

  biarticuladoNo: z.string().trim().optional().nullable(),
  mileage: z.string().trim().optional().nullable(),
  plate: z.string().trim().optional().nullable(),

  scheduledAt: z.string().datetime().optional().nullable(),
  executedAt: z.string().datetime().optional().nullable(),
  rescheduledAt: z.string().datetime().optional().nullable(),

  // devicesInstalled eliminado
  activities: z.any().optional().nullable(),

  observations: z.string().trim().optional().nullable(),
  timeStart: z.string().trim().optional().nullable(),
  timeEnd: z.string().trim().optional().nullable(),
  responsibleUpk: z.string().trim().optional().nullable(),
  responsibleCapitalBus: z.string().trim().optional().nullable(),
});

type Values = z.infer<typeof FormSchema>;

function toLocal(dt?: Date | string | null) {
  if (!dt) return "";
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PreventiveReportForm({
  workOrderId,
  initialReport,
}: {
  workOrderId: string;
  initialReport: any;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ticketNumber: initialReport?.ticketNumber ?? "",
      workOrderNumber: initialReport?.workOrderNumber ?? "",
      biarticuladoNo: initialReport?.biarticuladoNo ?? "",
      mileage: initialReport?.mileage ?? "",
      plate: initialReport?.plate ?? "",
      scheduledAt: initialReport?.scheduledAt ? toLocal(initialReport.scheduledAt) : null,
      executedAt: initialReport?.executedAt ? toLocal(initialReport.executedAt) : null,
      rescheduledAt: initialReport?.rescheduledAt ? toLocal(initialReport.rescheduledAt) : null,
      // devicesInstalled eliminado
      activities: initialReport?.activities ?? [],
      observations: initialReport?.observations ?? "",
      timeStart: initialReport?.timeStart ?? "",
      timeEnd: initialReport?.timeEnd ?? "",
      responsibleUpk: initialReport?.responsibleUpk ?? "",
      responsibleCapitalBus: initialReport?.responsibleCapitalBus ?? "",
    },
    mode: "onBlur",
  });

  const [saving, setSaving] = React.useState(false);

  async function save(values: Values) {
    setSaving(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/preventive-report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = payload?.issues?.length
          ? payload.issues.map((i: any) => `${i.path}: ${i.message}`).join("\n")
          : payload?.error || "Error guardando preventivo";
        alert(msg);
        return;
      }
      alert("Preventivo guardado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sts-card p-4 md:p-5">
        <p className="text-sm font-semibold">Preventivo</p>
        <p className="text-xs text-muted-foreground">Se guarda inline y habilita el cierre de OT.</p>
      </div>

      <form className="sts-card p-4 md:p-5 space-y-3" onSubmit={form.handleSubmit(save)}>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Ticket *</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" readOnly {...form.register("ticketNumber")} />
            <p className="text-xs text-red-600">{form.formState.errors.ticketNumber?.message}</p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">OT No.</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" {...form.register("workOrderNumber")} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Bus (código)</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" {...form.register("biarticuladoNo")} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Placa</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" {...form.register("plate")} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Fecha ejecutada</label>
            <input type="datetime-local" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" {...form.register("executedAt")} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Hora inicio</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" {...form.register("timeStart")} placeholder="HH:mm" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Hora fin</label>
            <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm" {...form.register("timeEnd")} placeholder="HH:mm" />
          </div>


          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Observaciones</label>
            <textarea className="mt-1 w-full rounded-md border px-3 py-2 text-sm" rows={4} {...form.register("observations")} />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="sts-btn-primary text-sm disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
