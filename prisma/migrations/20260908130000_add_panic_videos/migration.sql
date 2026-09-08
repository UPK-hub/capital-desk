-- Botón de pánico: eventos, clips de video y bitácora de gestión.

-- CreateEnum
CREATE TYPE "PanicEventStatus" AS ENUM ('PENDIENTE', 'EN_REVISION', 'ATENDIDO', 'DESCARTADO');
CREATE TYPE "PanicClipStatus" AS ENUM ('COMPLETO', 'INCOMPLETO', 'RECHAZADO');
CREATE TYPE "PanicEventLogType" AS ENUM ('EVENTO_CREADO', 'CLIP_RECIBIDO', 'CLIP_FALLIDO', 'CAMBIO_ESTADO', 'ASIGNACION', 'COMENTARIO', 'CASO_VINCULADO');

-- CreateTable
CREATE TABLE "PanicEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT,
    "busCode" TEXT,
    "plate" TEXT,
    "externalEventId" TEXT NOT NULL,
    "deviceId" TEXT,
    "vehicleId" TEXT,
    "alarmCode" TEXT,
    "alarmLabel" TEXT,
    "eventAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstClipAt" TIMESTAMPTZ(3),
    "lastClipAt" TIMESTAMPTZ(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "expectedClips" INTEGER NOT NULL DEFAULT 0,
    "receivedClips" INTEGER NOT NULL DEFAULT 0,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "status" "PanicEventStatus" NOT NULL DEFAULT 'PENDIENTE',
    "assignedToId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "notes" TEXT,
    "caseId" TEXT,
    "metadata" JSONB,
    "requestMeta" JSONB,

    CONSTRAINT "PanicEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanicVideoClip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" INTEGER,
    "cameraLabel" TEXT,
    "filename" TEXT,
    "originalName" TEXT,
    "filePath" TEXT NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'panic',
    "mimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "declaredBytes" BIGINT,
    "durationSec" INTEGER,
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "checksum" TEXT,
    "status" "PanicClipStatus" NOT NULL DEFAULT 'COMPLETO',
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "requestMeta" JSONB,

    CONSTRAINT "PanicVideoClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanicEventLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "PanicEventLogType" NOT NULL,
    "message" TEXT,
    "fromStatus" "PanicEventStatus",
    "toStatus" "PanicEventStatus",
    "actorUserId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanicEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanicEvent_tenantId_externalEventId_key" ON "PanicEvent"("tenantId", "externalEventId");
CREATE INDEX "PanicEvent_tenantId_receivedAt_idx" ON "PanicEvent"("tenantId", "receivedAt");
CREATE INDEX "PanicEvent_tenantId_status_receivedAt_idx" ON "PanicEvent"("tenantId", "status", "receivedAt");
CREATE INDEX "PanicEvent_tenantId_busCode_receivedAt_idx" ON "PanicEvent"("tenantId", "busCode", "receivedAt");
CREATE INDEX "PanicEvent_tenantId_complete_receivedAt_idx" ON "PanicEvent"("tenantId", "complete", "receivedAt");
CREATE INDEX "PanicEvent_tenantId_eventAt_idx" ON "PanicEvent"("tenantId", "eventAt");

CREATE UNIQUE INDEX "PanicVideoClip_filePath_key" ON "PanicVideoClip"("filePath");
CREATE UNIQUE INDEX "PanicVideoClip_eventId_channel_key" ON "PanicVideoClip"("eventId", "channel");
CREATE INDEX "PanicVideoClip_tenantId_receivedAt_idx" ON "PanicVideoClip"("tenantId", "receivedAt");

CREATE INDEX "PanicEventLog_eventId_createdAt_idx" ON "PanicEventLog"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "PanicEvent" ADD CONSTRAINT "PanicEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PanicEvent" ADD CONSTRAINT "PanicEvent_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PanicEvent" ADD CONSTRAINT "PanicEvent_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PanicEvent" ADD CONSTRAINT "PanicEvent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PanicEvent" ADD CONSTRAINT "PanicEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PanicVideoClip" ADD CONSTRAINT "PanicVideoClip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PanicVideoClip" ADD CONSTRAINT "PanicVideoClip_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PanicEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PanicEventLog" ADD CONSTRAINT "PanicEventLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PanicEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PanicEventLog" ADD CONSTRAINT "PanicEventLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
