-- CreateTable
CREATE TABLE "InventorySerialCatalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serialNormalized" TEXT NOT NULL,
    "serialDisplay" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "brand" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySerialCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerialCatalog_tenantId_serialNormalized_key"
ON "InventorySerialCatalog"("tenantId", "serialNormalized");

-- CreateIndex
CREATE INDEX "InventorySerialCatalog_tenantId_serialNormalized_idx"
ON "InventorySerialCatalog"("tenantId", "serialNormalized");

-- AddForeignKey
ALTER TABLE "InventorySerialCatalog"
ADD CONSTRAINT "InventorySerialCatalog_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
