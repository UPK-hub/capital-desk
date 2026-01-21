/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,caseNo]` on the table `Case` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,workOrderNo]` on the table `WorkOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "caseNo" INTEGER;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "workOrderNo" INTEGER;

-- CreateTable
CREATE TABLE "TenantSequence" (
    "tenantId" TEXT NOT NULL,
    "nextCaseNo" INTEGER NOT NULL DEFAULT 1,
    "nextWorkOrderNo" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSequence_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "Case_tenantId_createdAt_idx" ON "Case"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_tenantId_status_idx" ON "Case"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Case_tenantId_type_idx" ON "Case"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Case_tenantId_caseNo_key" ON "Case"("tenantId", "caseNo");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_createdAt_idx" ON "WorkOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_tenantId_workOrderNo_key" ON "WorkOrder"("tenantId", "workOrderNo");

-- AddForeignKey
ALTER TABLE "TenantSequence" ADD CONSTRAINT "TenantSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
