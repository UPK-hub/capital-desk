CREATE TABLE "IntegrationVideo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT,
    "busCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'device-backup',
    "registerId" TEXT,
    "deviceId" TEXT,
    "vehicleId" TEXT,
    "filename" TEXT,
    "originalName" TEXT,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "metadataPath" TEXT,
    "metadata" JSONB,
    "requestMeta" JSONB,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationVideo_tenantId_receivedAt_idx" ON "IntegrationVideo"("tenantId", "receivedAt");
CREATE INDEX "IntegrationVideo_tenantId_busId_receivedAt_idx" ON "IntegrationVideo"("tenantId", "busId", "receivedAt");
CREATE INDEX "IntegrationVideo_tenantId_busCode_receivedAt_idx" ON "IntegrationVideo"("tenantId", "busCode", "receivedAt");
CREATE INDEX "IntegrationVideo_tenantId_deviceId_receivedAt_idx" ON "IntegrationVideo"("tenantId", "deviceId", "receivedAt");
CREATE INDEX "IntegrationVideo_tenantId_registerId_receivedAt_idx" ON "IntegrationVideo"("tenantId", "registerId", "receivedAt");

ALTER TABLE "IntegrationVideo" ADD CONSTRAINT "IntegrationVideo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationVideo" ADD CONSTRAINT "IntegrationVideo_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
