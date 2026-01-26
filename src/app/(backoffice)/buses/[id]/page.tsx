import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function badge(base: string) {
  return `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${base}`;
}

function statusBadge(active: boolean) {
  return active
    ? badge("bg-emerald-50 text-emerald-700 border-emerald-200")
    : badge("bg-zinc-50 text-zinc-700 border-zinc-200");
}

function caseStatusBadge(v: string) {
  if (v === "NUEVO") return badge("bg-blue-50 text-blue-700 border-blue-200");
  if (v === "OT_ASIGNADA") return badge("bg-amber-50 text-amber-800 border-amber-200");
  if (v === "EN_EJECUCION") return badge("bg-purple-50 text-purple-800 border-purple-200");
  if (v === "RESUELTO") return badge("bg-green-50 text-green-700 border-green-200");
  if (v === "CERRADO") return badge("bg-zinc-50 text-zinc-700 border-zinc-200");
  return badge("bg-zinc-50 text-zinc-700 border-zinc-200");
}

function woStatusBadge(v: string) {
  if (v === "CREADA") return badge("bg-zinc-50 text-zinc-700 border-zinc-200");
  if (v === "ASIGNADA") return badge("bg-amber-50 text-amber-800 border-amber-200");
  if (v === "EN_CAMPO") return badge("bg-purple-50 text-purple-800 border-purple-200");
  if (v === "FINALIZADA") return badge("bg-green-50 text-green-700 border-green-200");
  return badge("bg-zinc-50 text-zinc-700 border-zinc-200");
}

type PageProps = { params: { id: string } };

export default async function BusLifePage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="underline text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const busId = String(params.id);

  const bus = await prisma.bus.findFirst({
    where: { id: busId, tenantId },
    select: {
      id: true,
      code: true,
      plate: true,
      active: true,
      createdAt: true,
      equipments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          serial: true,
          location: true,
          active: true,
          equipmentType: { select: { name: true } },
        },
      },
      cases: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          status: true,
          priority: true,
          title: true,
          createdAt: true,
          busEquipmentId: true,
          workOrder: {
            select: {
              id: true,
              status: true,
              assignedToId: true,
              assignedAt: true,
              startedAt: true,
              finishedAt: true,
              assignedTo: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
      lifecycle: {
        orderBy: { occurredAt: "desc" },
        take: 200,
        select: {
          id: true,
          eventType: true,
          summary: true,
          occurredAt: true,
          caseId: true,
          workOrderId: true,
          busEquipmentId: true,
        },
      },
    },
  });

  if (!bus) return notFound();

  const caseIds = bus.cases.map((c) => c.id);
  const woIds = bus.cases.map((c) => c.workOrder?.id).filter(Boolean) as string[];

  const caseEvents = caseIds.length
    ? await prisma.caseEvent.findMany({
        where: { caseId: { in: caseIds } },
        orderBy: { createdAt: "asc" },
        take: 300,
        select: {
          id: true,
          caseId: true,
          type: true,
          message: true,
          meta: true,
          createdAt: true,
        },
      })
    : [];

  const woSteps = woIds.length
    ? await prisma.workOrderStep.findMany({
        where: { workOrderId: { in: woIds } },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          workOrderId: true,
          stepType: true,
          notes: true,
          createdAt: true,
          media: { select: { id: true, kind: true, filePath: true, createdAt: true } },
        },
      })
    : [];

  // ✅ Helpers tipados (sin map/filter que rompe tuplas)
  const equipmentNameById = new Map<string, string>();
  for (const e of bus.equipments) equipmentNameById.set(e.id, e.equipmentType.name);

  const caseTitleById = new Map<string, string>();
  for (const c of bus.cases) caseTitleById.set(c.id, c.title);

  type WO = NonNullable<(typeof bus.cases)[number]["workOrder"]>;
  const woById = new Map<string, WO>();
  for (const c of bus.cases) {
    if (c.workOrder?.id) woById.set(c.workOrder.id, c.workOrder as WO);
  }

  const timeline: Array<{
    at: Date;
    kind: "BUS" | "CASE" | "WO_STEP";
    title: string;
    message?: string;
    meta?: any;
    href?: string | null;
  }> = [];

  for (const e of bus.lifecycle) {
    timeline.push({
      at: e.occurredAt,
      kind: "BUS",
      title: e.eventType,
      message: e.summary,
      meta: { caseId: e.caseId, workOrderId: e.workOrderId, busEquipmentId: e.busEquipmentId },
      href: e.workOrderId ? `/work-orders/${e.workOrderId}` : e.caseId ? `/cases/${e.caseId}` : null,
    });
  }

  for (const e of caseEvents) {
    timeline.push({
      at: e.createdAt,
      kind: "CASE",
      title: `CASE:${e.type}`,
      message: e.message ?? "",
      meta: { caseId: e.caseId, ...(typeof e.meta === "object" && e.meta ? (e.meta as any) : {}) },
      href: `/cases/${e.caseId}`,
    });
  }

  for (const s of woSteps) {
    const wo = woById.get(s.workOrderId);
    timeline.push({
      at: s.createdAt,
      kind: "WO_STEP",
      title: `OT:${s.stepType}`,
      message: s.notes,
      meta: {
        workOrderId: s.workOrderId,
        media: s.media?.map((m) => ({ kind: m.kind, filePath: m.filePath })) ?? [],
      },
      href: wo?.id ? `/work-orders/${wo.id}` : `/work-orders/${s.workOrderId}`,
    });
  }

  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const activeEquipments = bus.equipments.filter((e) => e.active).length;
  const totalEquipments = bus.equipments.length;

  const totalCases = bus.cases.length;
  const casesWithWo = bus.cases.filter((c) => Boolean(c.workOrder?.id)).length;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            Hoja de vida • Bus {bus.code} {bus.plate ? `• ${bus.plate}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Bus <span className="font-mono">{bus.id}</span> • Creado {fmtDate(bus.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={statusBadge(bus.active)}>{bus.active ? "ACTIVO" : "INACTIVO"}</span>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/buses">
            Volver
          </Link>
          <Link className="rounded-md bg-black px-3 py-2 text-sm text-white" href="/cases/new">
            Crear caso
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Equipos</p>
          <p className="mt-1 text-lg font-semibold">{totalEquipments}</p>
          <p className="text-xs text-muted-foreground">{activeEquipments} activos</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Casos recientes</p>
          <p className="mt-1 text-lg font-semibold">{totalCases}</p>
          <p className="text-xs text-muted-foreground">últimos 50</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">OT asociadas</p>
          <p className="mt-1 text-lg font-semibold">{casesWithWo}</p>
          <p className="text-xs text-muted-foreground">derivadas de casos</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Eventos timeline</p>
          <p className="mt-1 text-lg font-semibold">{timeline.length}</p>
          <p className="text-xs text-muted-foreground">bus + casos + OT</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Izquierda */}
        <div className="lg:col-span-2 space-y-6">
          {/* Inventario */}
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Inventario de equipos</h2>
              <p className="text-xs text-muted-foreground">{bus.equipments.length} registros</p>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left">Tipo</th>
                    <th className="py-2 text-left">Serial</th>
                    <th className="py-2 text-left">Estado</th>
                    <th className="py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {bus.equipments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-muted-foreground">
                        Sin equipos asociados.
                      </td>
                    </tr>
                  ) : (
                    bus.equipments.map((e) => (
                      <tr key={e.id} className="border-b last:border-b-0">
                        <td className="py-2 font-medium">{e.equipmentType.name}</td>
                        <td className="py-2">{e.serial ?? "—"}</td>
                        <td className="py-2">
                          <span className={statusBadge(e.active)}>{e.active ? "ACTIVO" : "INACTIVO"}</span>
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <Link className="underline" href={`/equipments/${e.id}`}>
                            Ver hoja de vida
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Casos */}
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Casos recientes</h2>
              <p className="text-xs text-muted-foreground">últimos {bus.cases.length}</p>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left">Fecha</th>
                    <th className="py-2 text-left">Título</th>
                    <th className="py-2 text-left">Tipo</th>
                    <th className="py-2 text-left">Estado</th>
                    <th className="py-2 text-left">OT</th>
                    <th className="py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {bus.cases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-muted-foreground">
                        No hay casos para este bus.
                      </td>
                    </tr>
                  ) : (
                    bus.cases.map((c) => (
                      <tr key={c.id} className="border-b last:border-b-0">
                        <td className="py-2 whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                        <td className="py-2">
                          <div className="font-medium">{c.title}</div>
                          <div className="text-xs text-muted-foreground">Prio {c.priority}</div>
                        </td>
                        <td className="py-2">{c.type}</td>
                        <td className="py-2">
                          <span className={caseStatusBadge(c.status)}>{c.status}</span>
                        </td>
                        <td className="py-2">
                          {c.workOrder ? (
                            <span className={woStatusBadge(c.workOrder.status)}>{c.workOrder.status}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <Link className="underline" href={`/cases/${c.id}`}>
                            Abrir caso
                          </Link>
                          {c.workOrder?.id ? (
                            <>
                              <span className="mx-2 text-muted-foreground">•</span>
                              <Link className="underline" href={`/work-orders/${c.workOrder.id}`}>
                                Abrir OT
                              </Link>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Trazabilidad (timeline)</h2>
              <p className="text-xs text-muted-foreground">
                {bus.lifecycle.length} eventos bus • {caseEvents.length} eventos caso • {woSteps.length} pasos OT
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay eventos para mostrar.</p>
              ) : (
                timeline.map((it, idx) => (
                  <div key={`${it.kind}-${idx}`} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {it.kind}
                          </span>
                          <p className="text-sm font-semibold">{it.title}</p>
                        </div>

                        {it.message ? (
                          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{it.message}</p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {it.meta?.busEquipmentId ? (
                            <span>Equipo: {equipmentNameById.get(it.meta.busEquipmentId) ?? it.meta.busEquipmentId}</span>
                          ) : null}
                          {it.meta?.caseId ? (
                            <span>Caso: {caseTitleById.get(it.meta.caseId) ?? it.meta.caseId}</span>
                          ) : null}
                        </div>

                        {it.href ? (
                          <div className="mt-2">
                            <Link className="text-xs underline" href={it.href}>
                              Abrir
                            </Link>
                          </div>
                        ) : null}
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
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Derecha: panel rápido */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Acciones rápidas</h2>
            <div className="mt-3 space-y-2">
              <Link
                className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm text-white"
                href="/cases/new"
              >
                Crear caso para este bus
              </Link>
              <Link className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm" href="/cases">
                Ir a bandeja de casos
              </Link>
              <Link className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm" href="/buses">
                Volver a listado buses
              </Link>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Resumen</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Bus</p>
                <p className="mt-1 font-medium">{bus.code}</p>
                <p className="text-xs text-muted-foreground">{bus.plate ?? "Sin placa"}</p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Estado</p>
                <p className="mt-1 font-medium">{bus.active ? "ACTIVO" : "INACTIVO"}</p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Equipos activos</p>
                <p className="mt-1 font-medium">
                  {activeEquipments} / {totalEquipments}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
