-- AlterTable
ALTER TABLE "IntegrationInboundEvent"
ADD COLUMN "tramaType" INTEGER,
ADD COLUMN "tramaSubtype" TEXT,
ADD COLUMN "eventCode" TEXT,
ADD COLUMN "eventLabel" TEXT,
ADD COLUMN "alarmCode" TEXT,
ADD COLUMN "alarmLabel" TEXT,
ADD COLUMN "alarmLevelCode" TEXT,
ADD COLUMN "alarmLevelLabel" TEXT;

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_kind_eventAt_idx"
ON "IntegrationInboundEvent"("tenantId", "kind", "eventAt");

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_tramaType_tramaSubtype_eventAt_idx"
ON "IntegrationInboundEvent"("tenantId", "tramaType", "tramaSubtype", "eventAt");

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_eventCode_eventAt_idx"
ON "IntegrationInboundEvent"("tenantId", "eventCode", "eventAt");

-- CreateIndex
CREATE INDEX "IntegrationInboundEvent_tenantId_alarmCode_alarmLevelCode_eventAt_idx"
ON "IntegrationInboundEvent"("tenantId", "alarmCode", "alarmLevelCode", "eventAt");

