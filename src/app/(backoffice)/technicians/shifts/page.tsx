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
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-0">
          <div>
            <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Turnos técnicos</h1>
            <p className="text-sm text-muted-foreground">Registro de ingreso/salida y horas extra.</p>
          </div>
          <a
            className="sts-btn-primary inline-flex h-10 items-center justify-center px-4 text-sm"
            href="/api/technicians/shifts/export"
            target="_blank"
            rel="noreferrer"
          >
            Exportar Excel
          </a>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">

      {logs.length === 0 ? (
        <div className="sts-card p-6 text-sm text-muted-foreground">No hay registros.</div>
      ) : (
        <>
          <div className="mobile-list-stack lg:hidden">
            {logs.map((log) => {
              const shiftType = log.user.technicianSchedule?.shiftType ?? null;
              const expected = shiftType ? shiftDurationMinutes(shiftType) / 60 : null;
              const worked = log.endedAt ? hoursDiff(log.startedAt, log.endedAt) : null;
              const overtime = worked !== null && expected !== null ? Math.max(0, worked - expected) : null;

              return (
                <article key={log.id} className="sts-card p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{log.user.name}</p>
                    <p className="text-xs text-muted-foreground break-all">{log.user.email ?? "-"}</p>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <p className="text-muted-foreground">Turno: <span className="text-foreground">{shiftType ? SHIFT_LABELS[shiftType] : "Sin asignar"}</span></p>
                    <p className="text-muted-foreground">Inicio: <span className="text-foreground">{fmtDate(log.startedAt)}</span></p>
                    <p className="text-muted-foreground">Salida: <span className="text-foreground">{fmtDate(log.endedAt)}</span></p>
                    <p className="text-muted-foreground">Horas: <span className="text-foreground">{worked !== null ? fmtHours(worked) : "-"}</span></p>
                    <p className="text-muted-foreground">Extra: <span className="text-foreground">{overtime !== null ? fmtHours(overtime) : "-"}</span></p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden lg:block">
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
          </div>
        </>
      )}
      </div>
    </div>
  );
}
