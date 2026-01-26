-- CreateEnum
CREATE TYPE "TechnicianShiftType" AS ENUM ('DIURNO_AM', 'DIURNO_PM', 'NOCTURNO');

-- CreateEnum
CREATE TYPE "TechnicianRestDay" AS ENUM ('SATURDAY', 'SUNDAY');

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledTo" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TechnicianSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftType" "TechnicianShiftType" NOT NULL,
    "restDay" "TechnicianRestDay" NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianSchedule_userId_key" ON "TechnicianSchedule"("userId");

-- CreateIndex
CREATE INDEX "TechnicianSchedule_tenantId_idx" ON "TechnicianSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedToId_scheduledAt_idx" ON "WorkOrder"("assignedToId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "TechnicianSchedule" ADD CONSTRAINT "TechnicianSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianSchedule" ADD CONSTRAINT "TechnicianSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
