import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, TechnicianShiftType } from "@prisma/client";
import { shiftDurationMinutes } from "@/lib/technician-schedule";

function fmtDate(d: Date | null) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function hoursDiff(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

function fmtHours(v: number) {
  return `${v.toFixed(2)} h`;
}

const SHIFT_LABELS: Record<TechnicianShiftType, string> = {
  DIURNO_AM: "Diurno AM (04:00-12:00)",
  DIURNO_PM: "Diurno PM (14:00-18:00)",
  NOCTURNO: "Nocturno (21:00-05:00)",
};

export default async function TechnicianShiftLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autenticado.</p>
          <Link className="underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE].includes(role)) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const logs = await prisma.technicianShiftLog.findMany({
    where: { tenantId },
    orderBy: { startedAt: "desc" },
    take: 200,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          technicianSchedule: { select: { shiftType: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Turnos técnicos</h1>
          <p className="text-sm text-muted-foreground">Registro de ingreso/salida y horas extra.</p>
        </div>
        <a
          className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm"
          href="/api/technicians/shifts/export"
          target="_blank"
          rel="noreferrer"
        >
          Exportar Excel
        </a>
      </div>

      <div className="sts-card">
        <div className="grid grid-cols-12 border-b px-4 py-2 text-xs text-muted-foreground">
          <div className="col-span-3">Técnico</div>
          <div className="col-span-3">Turno asignado</div>
          <div className="col-span-2">Inicio</div>
          <div className="col-span-2">Salida</div>
          <div className="col-span-1">Horas</div>
          <div className="col-span-1">Extra</div>
        </div>

        {logs.map((log) => {
          const shiftType = log.user.technicianSchedule?.shiftType ?? null;
          const expected = shiftType ? shiftDurationMinutes(shiftType) / 60 : null;
          const worked = log.endedAt ? hoursDiff(log.startedAt, log.endedAt) : null;
          const overtime = worked !== null && expected !== null ? Math.max(0, worked - expected) : null;

          return (
            <div key={log.id} className="grid grid-cols-12 items-center px-4 py-3 text-sm border-b last:border-b-0">
              <div className="col-span-3">
                <div className="font-medium">{log.user.name}</div>
                <div className="text-xs text-muted-foreground">{log.user.email ?? "-"}</div>
              </div>
              <div className="col-span-3 text-xs">
                {shiftType ? SHIFT_LABELS[shiftType] : "Sin asignar"}
              </div>
              <div className="col-span-2">{fmtDate(log.startedAt)}</div>
              <div className="col-span-2">{fmtDate(log.endedAt)}</div>
              <div className="col-span-1">{worked !== null ? fmtHours(worked) : "-"}</div>
              <div className="col-span-1">{overtime !== null ? fmtHours(overtime) : "-"}</div>
            </div>
          );
        })}

        {logs.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No hay registros.</div> : null}
      </div>
    </div>
  );
}
