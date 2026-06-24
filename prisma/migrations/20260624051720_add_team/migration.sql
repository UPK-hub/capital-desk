-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewCases" BOOLEAN NOT NULL DEFAULT true,
    "viewVideoRequests" BOOLEAN NOT NULL DEFAULT true,
    "viewWorkOrders" BOOLEAN NOT NULL DEFAULT true,
    "viewTelemetry" BOOLEAN NOT NULL DEFAULT false,
    "manageUsers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_tenantId_name_key" ON "Team"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Team_tenantId_idx" ON "Team"("tenantId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
