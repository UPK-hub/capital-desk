-- AlterEnum
ALTER TYPE "CaseType" ADD VALUE 'RENOVACION_TECNOLOGICA';

-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "ipSimcard" TEXT,
ADD COLUMN     "linkSmartHelios" TEXT;

-- AlterTable
ALTER TABLE "BusEquipment" ADD COLUMN     "deviceCode" TEXT,
ADD COLUMN     "ipAddress" TEXT;

-- CreateTable
CREATE TABLE "RenewalTechReport" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "workOrderNumber" TEXT,
    "busCode" TEXT,
    "plate" TEXT,
    "linkSmartHelios" TEXT,
    "ipSimcard" TEXT,
    "removedChecklist" JSONB,
    "newInstallation" JSONB,
    "finalChecklist" JSONB,
    "timeStart" TEXT,
    "timeEnd" TEXT,
    "observations" TEXT,
    "photosOld" JSONB,
    "photosNew" JSONB,
    "photosChecklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalTechReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenewalTechReport_workOrderId_key" ON "RenewalTechReport"("workOrderId");

-- AddForeignKey
ALTER TABLE "RenewalTechReport" ADD CONSTRAINT "RenewalTechReport_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
