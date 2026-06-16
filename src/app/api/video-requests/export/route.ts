export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, VideoCaseStatus, VideoDownloadStatus } from "@prisma/client";
import { buildVideoRequestCaseScope } from "@/lib/access-control";
import { labelFromMap, videoCaseStatusLabels, videoDownloadStatusLabels } from "@/lib/labels";
import { utils, write } from "xlsx";

const ORIGIN_LABELS: Record<string, string> = {
  TRANSMILENIO_SA: "TransMilenio S.A.",
  INTERVENTORIA: "Interventoría",
  CAPITAL_BUS: "Capital Bus",
  OTRO: "Otro",
};

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN, Role.SUPERVISOR].includes(role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const estadoRaw = searchParams.get("estado") ?? "";
  const descargaRaw = searchParams.get("descarga") ?? "";
  const estado = (Object.values(VideoCaseStatus) as string[]).includes(estadoRaw)
    ? (estadoRaw as VideoCaseStatus)
    : undefined;
  const descarga = (Object.values(VideoDownloadStatus) as string[]).includes(descargaRaw)
    ? (descargaRaw as VideoDownloadStatus)
    : undefined;

  const items = await prisma.videoDownloadRequest.findMany({
    where: {
      case: { tenantId, ...caseScope },
      ...(estado ? { status: estado } : {}),
      ...(descarga ? { downloadStatus: descarga } : {}),
      ...(q
        ? {
            OR: [
              { requesterPhone: { contains: q, mode: "insensitive" } },
              { vehicleId: { contains: q, mode: "insensitive" } },
              { case: { bus: { code: { contains: q, mode: "insensitive" } } } },
              { case: { bus: { plate: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      case: { select: { caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { name: true } },
    },
  });

  const detail = items.map((r) => ({
    Caso: r.case.caseNo ?? "",
    Bus: r.case.bus.code,
    Placa: r.case.bus.plate ?? "",
    Vehículo: r.vehicleId ?? "",
    Título: r.case.title,
    Estado: labelFromMap(r.status, videoCaseStatusLabels),
    "Estado descarga": labelFromMap(r.downloadStatus, videoDownloadStatusLabels),
    Procedencia: ORIGIN_LABELS[r.origin] ?? r.origin,
    "Tipo requerimiento": r.requestType ?? "",
    Técnico: r.assignedTo?.name ?? "Sin asignar",
    Solicitante: r.requesterName ?? "",
    Teléfono: r.requesterPhone ?? "",
    Email: r.requesterEmail ?? "",
    "Radicado TMSA": r.tmsaRadicado ?? "",
    "Medio entrega": r.deliveryMethod ?? "",
    Cámaras: r.camerasRequested ?? "",
    "Evento inicio": fmt(r.eventStart),
    "Evento fin": fmt(r.eventEnd),
    Creado: fmt(r.createdAt),
    Actualizado: fmt(r.updatedAt),
  }));

  const countBy = (field: "status" | "downloadStatus" | "origin", key: string) =>
    items.filter((r) => (r as any)[field] === key).length;

  const resumen = [
    { Indicador: "Total solicitudes", Valor: items.length },
    { Indicador: "Caso · En espera", Valor: countBy("status", "EN_ESPERA") },
    { Indicador: "Caso · En curso", Valor: countBy("status", "EN_CURSO") },
    { Indicador: "Caso · Completado", Valor: countBy("status", "COMPLETADO") },
    { Indicador: "Descarga · Pendiente", Valor: countBy("downloadStatus", "PENDIENTE") },
    { Indicador: "Descarga · Realizada", Valor: countBy("downloadStatus", "DESCARGA_REALIZADA") },
    { Indicador: "Descarga · Fallida", Valor: countBy("downloadStatus", "DESCARGA_FALLIDA") },
    { Indicador: "Descarga · Bus no en patio", Valor: countBy("downloadStatus", "BUS_NO_EN_PATIO") },
    { Indicador: "Procedencia · TransMilenio S.A.", Valor: countBy("origin", "TRANSMILENIO_SA") },
    { Indicador: "Procedencia · Interventoría", Valor: countBy("origin", "INTERVENTORIA") },
    { Indicador: "Procedencia · Capital Bus", Valor: countBy("origin", "CAPITAL_BUS") },
    { Indicador: "Procedencia · Otro", Valor: countBy("origin", "OTRO") },
  ];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(resumen), "Resumen");
  utils.book_append_sheet(
    wb,
    utils.json_to_sheet(detail.length ? detail : [{ Caso: "Sin solicitudes" }]),
    "Solicitudes"
  );

  const buffer = write(wb, { type: "buffer", bookType: "xlsx" });
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=solicitudes-video-${fecha}.xlsx`,
    },
  });
}
