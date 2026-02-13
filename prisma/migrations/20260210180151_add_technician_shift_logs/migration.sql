-- CreateTable
CREATE TABLE "TechnicianShiftLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianShiftLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechnicianShiftLog_tenantId_startedAt_idx" ON "TechnicianShiftLog"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "TechnicianShiftLog_userId_startedAt_idx" ON "TechnicianShiftLog"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "TechnicianShiftLog" ADD CONSTRAINT "TechnicianShiftLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianShiftLog" ADD CONSTRAINT "TechnicianShiftLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
