-- CreateEnum
CREATE TYPE "StsTelemetryKind" AS ENUM ('TRAMAS', 'ALARMAS', 'PANIC', 'EVENTOS');

-- CreateTable
CREATE TABLE "StsTelemetryEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "StsTelemetryKind" NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "sourceFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StsTelemetryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StsTelemetryEntry_tenantId_kind_createdAt_idx" ON "StsTelemetryEntry"("tenantId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "StsTelemetryEntry" ADD CONSTRAINT "StsTelemetryEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
