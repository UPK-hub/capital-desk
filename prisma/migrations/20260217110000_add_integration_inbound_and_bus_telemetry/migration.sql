-- CreateEnum
CREATE TYPE "IntegrationInboundStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "IntegrationInboundEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT,
    "busCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "StsTelemetryKind" NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT,
    "message" TEXT,
    "eventAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "IntegrationInboundStatus" NOT NULL DEFAULT 'RECEIVED',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestMeta" JSONB,

    CONSTRAINT "IntegrationInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusTelemetryState" (
    "busId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastEventType" TEXT,
    "lastSeverity" TEXT,
    "lastMessage" TEXT,
    "lastPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusTelemetryState_pkey" PRIMARY KEY ("busId")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationInboundEvent_tenantId_externalId_key" ON "IntegrationInboundEvent"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_status_receivedAt_idx" ON "IntegrationInboundEvent"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_busId_eventAt_idx" ON "IntegrationInboundEvent"("tenantId", "busId", "eventAt");

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_busCode_eventAt_idx" ON "IntegrationInboundEvent"("tenantId", "busCode", "eventAt");

-- CreateIndex
CREATE INDEX "BusTelemetryState_tenantId_lastSeenAt_idx" ON "BusTelemetryState"("tenantId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "IntegrationInboundEvent" ADD CONSTRAINT "IntegrationInboundEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationInboundEvent" ADD CONSTRAINT "IntegrationInboundEvent_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusTelemetryState" ADD CONSTRAINT "BusTelemetryState_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusTelemetryState" ADD CONSTRAINT "BusTelemetryState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
