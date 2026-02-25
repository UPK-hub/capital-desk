-- CreateEnum
CREATE TYPE "RemoteVisualReviewStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable
CREATE TABLE "RemoteVisualReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reviewDate" DATE NOT NULL,
    "responsibleId" TEXT,
    "scheduleWindow" TEXT,
    "busLimit" INTEGER NOT NULL DEFAULT 8,
    "busCount" INTEGER NOT NULL DEFAULT 0,
    "generalResult" TEXT,
    "relevantFindings" TEXT,
    "ticketUpk" TEXT,
    "requiresCorrective" BOOLEAN NOT NULL DEFAULT false,
    "capitalbusOt" TEXT,
    "evidencesNotes" TEXT,
    "status" "RemoteVisualReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RemoteVisualReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteVisualReviewBus" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "busCode" TEXT NOT NULL,
    "busPlate" TEXT,
    "nvrIp" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "generalResult" TEXT,
    "relevantFindings" TEXT,
    "ticketUpk" TEXT,
    "requiresCorrective" BOOLEAN NOT NULL DEFAULT false,
    "capitalbusOt" TEXT,
    "checklist" JSONB,
    "evidences" JSONB,
    "correctiveCaseId" TEXT,
    "correctiveCaseNo" INTEGER,
    "correctiveWorkOrderId" TEXT,
    "correctiveWorkOrderNo" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RemoteVisualReviewBus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemoteVisualReview_tenantId_reviewDate_key" ON "RemoteVisualReview"("tenantId", "reviewDate");

-- CreateIndex
CREATE INDEX "RemoteVisualReview_tenantId_reviewDate_idx" ON "RemoteVisualReview"("tenantId", "reviewDate");

-- CreateIndex
CREATE INDEX "RemoteVisualReview_tenantId_status_idx" ON "RemoteVisualReview"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteVisualReviewBus_reviewId_busId_key" ON "RemoteVisualReviewBus"("reviewId", "busId");

-- CreateIndex
CREATE INDEX "RemoteVisualReviewBus_busId_reviewedAt_idx" ON "RemoteVisualReviewBus"("busId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "RemoteVisualReview" ADD CONSTRAINT "RemoteVisualReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteVisualReview" ADD CONSTRAINT "RemoteVisualReview_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteVisualReviewBus" ADD CONSTRAINT "RemoteVisualReviewBus_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "RemoteVisualReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteVisualReviewBus" ADD CONSTRAINT "RemoteVisualReviewBus_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
