-- Replica automatica de los videos de solicitudes de descarga al OneDrive del cliente.

-- CreateEnum
CREATE TYPE "OneDriveSyncStatus" AS ENUM ('PENDIENTE', 'SUBIENDO', 'REPLICADO', 'ERROR', 'OMITIDO');

-- AlterTable
ALTER TABLE "VideoAttachment"
  ADD COLUMN "odStatus" "OneDriveSyncStatus",
  ADD COLUMN "odItemId" TEXT,
  ADD COLUMN "odWebUrl" TEXT,
  ADD COLUMN "odPath" TEXT,
  ADD COLUMN "odSyncedAt" TIMESTAMPTZ(3),
  ADD COLUMN "odAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "odError" TEXT,
  ADD COLUMN "odNextAttemptAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "VideoAttachment_odStatus_odNextAttemptAt_idx" ON "VideoAttachment"("odStatus", "odNextAttemptAt");
