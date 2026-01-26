-- CreateEnum
CREATE TYPE "StsTicketSeverity" AS ENUM ('EMERGENCY', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "StsTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_VENDOR', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StsTicketChannel" AS ENUM ('PHONE', 'EMAIL', 'CHAT', 'OTHER');

-- CreateEnum
CREATE TYPE "StsTicketEventType" AS ENUM ('STATUS_CHANGE', 'COMMENT', 'ASSIGN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "StsKpiMetric" AS ENUM ('SUPPORT_RESPONSE', 'AVAILABILITY', 'PREVENTIVE_MAINTENANCE', 'TRANSMISSION', 'DATA_CAPTURE', 'RECORDING', 'IMAGE_QUALITY_RECORDED', 'IMAGE_QUALITY_TRANSMITTED', 'PANIC_ALARM_GENERATION');

-- CreateEnum
CREATE TYPE "StsKpiPeriodicity" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE 'HELPDESK';
ALTER TYPE "Role" ADD VALUE 'AUDITOR';

-- CreateTable
CREATE TABLE "StsComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StsComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "severity" "StsTicketSeverity" NOT NULL,
    "status" "StsTicketStatus" NOT NULL DEFAULT 'OPEN',
    "channel" "StsTicketChannel" NOT NULL,
    "description" TEXT NOT NULL,
    "vendorId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "breachResponse" BOOLEAN NOT NULL DEFAULT false,
    "breachResolution" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StsTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "StsTicketEventType" NOT NULL,
    "status" "StsTicketStatus",
    "message" TEXT,
    "meta" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StsTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsSlaPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "severity" "StsTicketSeverity" NOT NULL,
    "responseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "pauseStatuses" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StsSlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsKpiPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "metric" "StsKpiMetric" NOT NULL,
    "threshold" DECIMAL(5,2) NOT NULL,
    "periodicity" "StsKpiPeriodicity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StsKpiPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsKpiMeasurement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "metric" "StsKpiMetric" NOT NULL,
    "periodicity" "StsKpiPeriodicity" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(6,2) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StsKpiMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsMaintenanceWindow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "componentId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StsMaintenanceWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StsAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StsComponent_tenantId_active_idx" ON "StsComponent"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "StsComponent_tenantId_code_key" ON "StsComponent"("tenantId", "code");

-- CreateIndex
CREATE INDEX "StsTicket_tenantId_openedAt_idx" ON "StsTicket"("tenantId", "openedAt");

-- CreateIndex
CREATE INDEX "StsTicket_tenantId_status_idx" ON "StsTicket"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StsTicket_tenantId_severity_idx" ON "StsTicket"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "StsTicket_componentId_status_idx" ON "StsTicket"("componentId", "status");

-- CreateIndex
CREATE INDEX "StsTicketEvent_ticketId_createdAt_idx" ON "StsTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "StsSlaPolicy_tenantId_severity_idx" ON "StsSlaPolicy"("tenantId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "StsSlaPolicy_tenantId_componentId_severity_key" ON "StsSlaPolicy"("tenantId", "componentId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "StsKpiPolicy_tenantId_componentId_metric_periodicity_key" ON "StsKpiPolicy"("tenantId", "componentId", "metric", "periodicity");

-- CreateIndex
CREATE INDEX "StsKpiMeasurement_tenantId_metric_periodicity_periodStart_idx" ON "StsKpiMeasurement"("tenantId", "metric", "periodicity", "periodStart");

-- CreateIndex
CREATE INDEX "StsMaintenanceWindow_tenantId_startAt_idx" ON "StsMaintenanceWindow"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "StsAuditLog_tenantId_createdAt_idx" ON "StsAuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "StsComponent" ADD CONSTRAINT "StsComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsTicket" ADD CONSTRAINT "StsTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsTicket" ADD CONSTRAINT "StsTicket_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "StsComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsTicket" ADD CONSTRAINT "StsTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsTicketEvent" ADD CONSTRAINT "StsTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "StsTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsTicketEvent" ADD CONSTRAINT "StsTicketEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsSlaPolicy" ADD CONSTRAINT "StsSlaPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsSlaPolicy" ADD CONSTRAINT "StsSlaPolicy_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "StsComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsKpiPolicy" ADD CONSTRAINT "StsKpiPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsKpiPolicy" ADD CONSTRAINT "StsKpiPolicy_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "StsComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsKpiMeasurement" ADD CONSTRAINT "StsKpiMeasurement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsKpiMeasurement" ADD CONSTRAINT "StsKpiMeasurement_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "StsComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsMaintenanceWindow" ADD CONSTRAINT "StsMaintenanceWindow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsMaintenanceWindow" ADD CONSTRAINT "StsMaintenanceWindow_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "StsComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsAuditLog" ADD CONSTRAINT "StsAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StsAuditLog" ADD CONSTRAINT "StsAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
