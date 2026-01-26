import { CaseStatus, StsTicketStatus } from "@prisma/client";

export function mapTicketStatusToCaseStatus(status: StsTicketStatus) {
  if (status === StsTicketStatus.OPEN) return CaseStatus.NUEVO;
  if (status === StsTicketStatus.IN_PROGRESS) return CaseStatus.EN_EJECUCION;
  if (status === StsTicketStatus.WAITING_VENDOR) return CaseStatus.EN_EJECUCION;
  if (status === StsTicketStatus.RESOLVED) return CaseStatus.RESUELTO;
  return CaseStatus.CERRADO;
}
