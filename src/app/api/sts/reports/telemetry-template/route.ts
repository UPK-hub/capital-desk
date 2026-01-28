export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { canStsRead } from "@/lib/sts/access";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tramasRows = [
    ["", "Registros", "de la fecha :", "DD/MM/AAAA", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", ""],
    [
      "",
      "Vehículo",
      "Esperadas",
      "Eficiencia %",
      "TotalP20+P60",
      "P20",
      "P60",
      "Total horas",
      "Inicio Operacion",
      "Fin Operacion",
    ],
    ["DD/MM/AAAA", "K0000", "0", "0", "0", "0", "0", "00:00:00", "00:00:00", "00:00:00"],
  ];

  const alarmasRows = [
    ["ID", "ALA1", "ALA2", "ALA3", "ALA4", "ALA5", "ALA6", "ALA7", "TOTAL"],
    [
      "Vehículos",
      "Aceleración brusca",
      "Frenada brusca",
      "Exceso de velocidad",
      "Exceso de peso",
      "Ausencia cámara conductor",
      "Ausencia cámara CCTV",
      "Giro brusco",
      "",
    ],
    ["K0000", "0", "0", "0", "0", "0", "0", "0", "0"],
  ];

  const panicRows = [
    ["Vehículos", "Registros"],
    ["K0000", "0"],
  ];

  const eventosRows = [
    [
      "Vehículo",
      "Registros",
      "EV1",
      "EV2",
      "EV3",
      "EV4",
      "EV5",
      "EV6",
      "EV7",
      "EV8",
      "EV9",
      "EV10",
      "EV11",
      "EV12",
      "EV13",
      "EV14",
      "EV15",
      "EV16",
      "EV17",
      "EV18",
    ],
    [
      "",
      "",
      "Parada en estación",
      "Cambio de apertura o cierre de puertas",
      "Cambio de estado del sistema de ventilación",
      "Cambio de estado del sistema iluminación",
      "Cambio de estado del sistema limpia parabrisas",
      "Encendido de vehículo",
      "Apagado del vehículo",
      "Cambio de conductor",
      "Activación de botón de pánico",
      "Accidente o colisión",
      "Por demanda",
      "Desconexión de energía principal del STS",
      "Evento de encendido del STS",
      "Evento de apagado del STS",
      "Inicio de operación",
      "Fin de operación",
      "Reconexión de energía principal del STS",
      "Silla vacía del conductor",
    ],
    [
      "K0000",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
    ],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tramasRows), "Tramas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alarmasRows), "Alarmas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(panicRows), "Boton_panico");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eventosRows), "Eventos");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"sts_telemetria_template.xlsx\"",
    },
  });
}
