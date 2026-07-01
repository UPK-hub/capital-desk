-- CreateTable
CREATE TABLE "CasePreventiveChecklist" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" JSONB NOT NULL,
    "executedById" TEXT,
    "executedByName" TEXT,
    "executedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CasePreventiveChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CasePreventiveChecklist_caseId_key" ON "CasePreventiveChecklist"("caseId");

-- AddForeignKey
ALTER TABLE "CasePreventiveChecklist" ADD CONSTRAINT "CasePreventiveChecklist_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
