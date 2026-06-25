import { prisma } from "@/lib/prisma";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

/**
 * Retención de tramas con RESPALDO antes de borrar.
 *
 * Qué hace:
 *  1. Encuentra las tramas (IntegrationInboundEvent) más viejas que N días.
 *  2. Las exporta COMPLETAS a un archivo comprimido .ndjson.gz (una trama por
 *     línea, con todos sus datos) en una carpeta de respaldos.
 *  3. Solo si el respaldo quedó completo, borra esas tramas de la base.
 *
 * Es seguro: si el respaldo no cuadra, NO borra nada. Con --dry-run respalda
 * pero no borra (para revisar el archivo primero).
 *
 * Config por variables de entorno (opcionales):
 *  - TRAMAS_RETENTION_DAYS  (default 90)
 *  - TRAMAS_BACKUP_DIR      (default <proyecto>/backups/tramas)
 */

const RETENTION_DAYS = Number(process.env.TRAMAS_RETENTION_DAYS ?? 90);
const BACKUP_DIR =
  process.env.TRAMAS_BACKUP_DIR ?? path.join(process.cwd(), "backups", "tramas");
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const PAGE = 2000;

const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
    throw new Error(`TRAMAS_RETENTION_DAYS inválido: ${process.env.TRAMAS_RETENTION_DAYS}`);
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`Retención: ${RETENTION_DAYS} días.`);
  console.log(`Respaldar + borrar tramas con receivedAt < ${cutoff.toISOString()}`);
  if (DRY_RUN) console.log(">> MODO PRUEBA (--dry-run): respalda pero NO borra nada.");

  const total = await prisma.integrationInboundEvent.count({
    where: { receivedAt: { lt: cutoff } },
  });
  if (total === 0) {
    console.log("No hay tramas más viejas que el límite. Nada que hacer.");
    await prisma.$disconnect();
    return;
  }

  const oldest = await prisma.integrationInboundEvent.findFirst({
    where: { receivedAt: { lt: cutoff } },
    orderBy: { receivedAt: "asc" },
    select: { receivedAt: true },
  });
  const newest = await prisma.integrationInboundEvent.findFirst({
    where: { receivedAt: { lt: cutoff } },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  const stamp = `${fmtDay(oldest!.receivedAt)}_a_${fmtDay(newest!.receivedAt)}`;
  await mkdir(BACKUP_DIR, { recursive: true });
  const filePath = path.join(BACKUP_DIR, `tramas_${stamp}.ndjson.gz`);

  console.log(`Tramas a respaldar: ${total.toLocaleString()}`);
  console.log(`Archivo de respaldo: ${filePath}`);

  let written = 0;
  async function* rows() {
    let cursor: string | undefined;
    for (;;) {
      const page = await prisma.integrationInboundEvent.findMany({
        where: { receivedAt: { lt: cutoff } },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (page.length === 0) break;
      for (const row of page) {
        written += 1;
        yield JSON.stringify(row) + "\n";
      }
      cursor = page[page.length - 1]!.id;
      process.stdout.write(
        `\r  respaldando: ${written.toLocaleString()} / ${total.toLocaleString()}`
      );
    }
  }

  await pipeline(Readable.from(rows()), createGzip(), createWriteStream(filePath));
  console.log(`\nRespaldo completo: ${written.toLocaleString()} tramas.`);

  if (written !== total) {
    console.error(
      `\n⚠️  Se esperaban ${total} tramas pero se respaldaron ${written}. ` +
        `Por seguridad NO se borra nada. Revisa y vuelve a correr.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(
      "MODO PRUEBA: respaldo listo, no se borró nada. Revisa el archivo y, si todo bien, " +
        "corre de nuevo SIN --dry-run para borrar."
    );
    await prisma.$disconnect();
    return;
  }

  console.log("Borrando las tramas ya respaldadas...");
  let deleted = 0;
  for (;;) {
    const batch = await prisma.integrationInboundEvent.findMany({
      where: { receivedAt: { lt: cutoff } },
      orderBy: { id: "asc" },
      take: PAGE,
      select: { id: true },
    });
    if (batch.length === 0) break;
    const res = await prisma.integrationInboundEvent.deleteMany({
      where: { id: { in: batch.map((b) => b.id) } },
    });
    deleted += res.count;
    process.stdout.write(`\r  borrando: ${deleted.toLocaleString()} / ${total.toLocaleString()}`);
  }
  console.log(`\nListo. Borradas ${deleted.toLocaleString()} tramas. Respaldo en: ${filePath}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nLa purga falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
