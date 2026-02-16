import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, TechnicianShiftType } from "@prisma/client";
import { shiftDurationMinutes } from "@/lib/technician-schedule";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

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
          <Link className="sts-btn-ghost mt-3 text-sm" href="/login">
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
          className="sts-btn-primary text-sm"
          href="/api/technicians/shifts/export"
          target="_blank"
          rel="noreferrer"
        >
          Exportar Excel
        </a>
      </div>

      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Técnico</DataTableHead>
            <DataTableHead>Turno asignado</DataTableHead>
            <DataTableHead>Inicio</DataTableHead>
            <DataTableHead>Salida</DataTableHead>
            <DataTableHead>Horas</DataTableHead>
            <DataTableHead>Extra</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          {logs.map((log) => {
            const shiftType = log.user.technicianSchedule?.shiftType ?? null;
            const expected = shiftType ? shiftDurationMinutes(shiftType) / 60 : null;
            const worked = log.endedAt ? hoursDiff(log.startedAt, log.endedAt) : null;
            const overtime = worked !== null && expected !== null ? Math.max(0, worked - expected) : null;

            return (
              <DataTableRow key={log.id}>
                <DataTableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{log.user.name}</span>
                    <span className="text-xs text-muted-foreground">{log.user.email ?? "-"}</span>
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <span className="text-xs text-muted-foreground">{shiftType ? SHIFT_LABELS[shiftType] : "Sin asignar"}</span>
                </DataTableCell>
                <DataTableCell>{fmtDate(log.startedAt)}</DataTableCell>
                <DataTableCell>{fmtDate(log.endedAt)}</DataTableCell>
                <DataTableCell>{worked !== null ? fmtHours(worked) : "-"}</DataTableCell>
                <DataTableCell>{overtime !== null ? fmtHours(overtime) : "-"}</DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>

      {logs.length === 0 ? <div className="sts-card p-6 text-sm text-muted-foreground">No hay registros.</div> : null}
    </div>
  );
}
