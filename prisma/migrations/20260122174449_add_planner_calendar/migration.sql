-- CreateEnum
CREATE TYPE "CalendarSlotKind" AS ENUM ('AVAILABLE', 'BLOCKED', 'TIME_OFF');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PLANNER';

-- CreateTable
CREATE TABLE "TechnicianWeekCalendar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianWeekCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianWeekSlot" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "kind" "CalendarSlotKind" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianWeekSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechnicianWeekCalendar_tenantId_weekStart_idx" ON "TechnicianWeekCalendar"("tenantId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianWeekCalendar_tenantId_weekStart_key" ON "TechnicianWeekCalendar"("tenantId", "weekStart");

-- CreateIndex
CREATE INDEX "TechnicianWeekSlot_calendarId_idx" ON "TechnicianWeekSlot"("calendarId");

-- CreateIndex
CREATE INDEX "TechnicianWeekSlot_technicianId_startAt_idx" ON "TechnicianWeekSlot"("technicianId", "startAt");

-- AddForeignKey
ALTER TABLE "TechnicianWeekCalendar" ADD CONSTRAINT "TechnicianWeekCalendar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianWeekCalendar" ADD CONSTRAINT "TechnicianWeekCalendar_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianWeekSlot" ADD CONSTRAINT "TechnicianWeekSlot_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "TechnicianWeekCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianWeekSlot" ADD CONSTRAINT "TechnicianWeekSlot_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
