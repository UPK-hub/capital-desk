/*
  Warnings:

  - You are about to drop the column `productionSp` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageBatteriesMasterOff` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageCollectorFromCard` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageNvrFromCard` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageSwitch` on the `PreventiveReport` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CorrectiveReport" ADD COLUMN     "timeEnd" TEXT,
ADD COLUMN     "timeStart" TEXT;

-- AlterTable
ALTER TABLE "PreventiveReport" DROP COLUMN "productionSp",
DROP COLUMN "voltageBatteriesMasterOff",
DROP COLUMN "voltageCollectorFromCard",
DROP COLUMN "voltageNvrFromCard",
DROP COLUMN "voltageSwitch";

-- AlterTable
ALTER TABLE "TenantSequence" ADD COLUMN     "nextTicketNo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "InterventionReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "tmStartedAt" TIMESTAMP(3) NOT NULL,
    "tmEndedAt" TIMESTAMP(3) NOT NULL,
    "internalStart" TEXT,
    "internalEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterventionReceipt_workOrderId_key" ON "InterventionReceipt"("workOrderId");

-- CreateIndex
CREATE INDEX "InterventionReceipt_tenantId_createdAt_idx" ON "InterventionReceipt"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionReceipt_tenantId_ticketNo_key" ON "InterventionReceipt"("tenantId", "ticketNo");

-- AddForeignKey
ALTER TABLE "InterventionReceipt" ADD CONSTRAINT "InterventionReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionReceipt" ADD CONSTRAINT "InterventionReceipt_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionReceipt" ADD CONSTRAINT "InterventionReceipt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
