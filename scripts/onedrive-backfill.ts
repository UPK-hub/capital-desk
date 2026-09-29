/**
 * Encola los videos YA CARGADOS antes de que existiera la replica, para que el
 * worker los suba al OneDrive del cliente.
 *
 * Solo toma adjuntos activos de tipo VIDEO que todavia tengan su archivo en el
 * disco del servidor y que aun no esten en la cola (odStatus en null).
 *
 * Por defecto SIMULA: cuenta, pesa y no cambia nada. Hay que pasar --apply.
 *
 *   npm run onedrive:backfill                      simulacion de todo lo pendiente
 *   npm run onedrive:backfill -- --limite 200      simula solo los 200 mas viejos
 *   npm run onedrive:backfill -- --limite 200 --apply
 *   npm run onedrive:backfill -- --desde 2026-08-01 --hasta 2026-08-31 --apply
 *
 * Recomendacion: hacerlo por tandas y en horario nocturno. Cada tanda de 200
 * videos puede ser del orden de decenas de GB de subida.
 */

import "./cargar-env";
import fs from "node:fs/promises";
import { OneDriveSyncStatus, Prisma, VideoAttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveUploadPath } from "@/lib/uploads";
import { construirRutaRemota } from "@/lib/onedrive/sync";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : null;
}

const APPLY = process.argv.includes("--apply");
const LIMITE = Number(arg("limite") ?? 0) || 0;
const DESDE = arg("desde");
const HASTA = arg("hasta");

function fecha(valor: string | null, finDelDia = false): Date | null {
  if (!valor) return null;
  const d = new Date(`${valor}T${finDelDia ? "23:59:59.999" : "00:00:00.000"}-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function gb(bytes: number) {
  return (bytes / 1024 ** 3).toFixed(2);
}

async function main() {
  const desde = fecha(DESDE);
  const hasta = fecha(HASTA, true);

  const where: Prisma.VideoAttachmentWhereInput = {
    active: true,
    kind: VideoAttachmentKind.VIDEO,
    odStatus: null,
    ...(desde || hasta
      ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
      : {}),
  };

  const candidatos = await prisma.videoAttachment.findMany({
    where,
    orderBy: { createdAt: "asc" },
    ...(LIMITE ? { take: LIMITE } : {}),
    select: {
      id: true,
      filePath: true,
      originalName: true,
      size: true,
      createdAt: true,
      request: {
        select: { case: { select: { caseNo: true, createdAt: true, bus: { select: { code: true } } } } },
      },
    },
  });

  console.log(`\nCandidatos sin encolar: ${candidatos.length}`);
  if (DESDE || HASTA) console.log(`Rango: ${DESDE ?? "inicio"} a ${HASTA ?? "hoy"}`);
  if (LIMITE) console.log(`Limite aplicado: ${LIMITE}`);

  const conArchivo: string[] = [];
  let bytes = 0;
  let sinArchivo = 0;

  for (const c of candidatos) {
    try {
      const abs = resolveUploadPath(c.filePath);
      const st = await fs.stat(abs);
      conArchivo.push(c.id);
      bytes += st.size;
    } catch {
      sinArchivo += 1;
    }
  }

  console.log(`Con archivo en disco : ${conArchivo.length}  (${gb(bytes)} GB a subir)`);
  console.log(`Sin archivo en disco : ${sinArchivo}  (purgados, no se pueden replicar)`);

  if (candidatos.length) {
    const primero = candidatos[0];
    const ejemplo = construirRutaRemota({
      creadoEn: primero.request?.case?.createdAt ?? primero.createdAt,
      codigoBus: primero.request?.case?.bus?.code,
      caseNo: primero.request?.case?.caseNo,
      nombreArchivo: primero.originalName ?? primero.filePath,
    });
    console.log(`\nEjemplo de destino:\n  ${ejemplo}`);
  }

  if (!APPLY) {
    console.log(`\nSIMULACION. Nada se ha modificado. Agrega --apply para encolar.\n`);
    return;
  }

  if (!conArchivo.length) {
    console.log(`\nNo hay nada que encolar.\n`);
    return;
  }

  const ahora = new Date();
  let encolados = 0;
  const TANDA = 500;
  for (let i = 0; i < conArchivo.length; i += TANDA) {
    const lote = conArchivo.slice(i, i + TANDA);
    const r = await prisma.videoAttachment.updateMany({
      where: { id: { in: lote } },
      data: {
        odStatus: OneDriveSyncStatus.PENDIENTE,
        odAttempts: 0,
        odError: null,
        odNextAttemptAt: ahora,
      },
    });
    encolados += r.count;
  }

  console.log(`\nEncolados ${encolados} adjuntos (${gb(bytes)} GB).`);
  console.log(`El proceso onedrive-sync los ira subiendo de a ${process.env.ONEDRIVE_BATCH_SIZE ?? 3}.`);
  console.log(`Seguimiento: npm run onedrive:estado  o  pm2 logs onedrive-sync\n`);
}

main()
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
