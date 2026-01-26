/*
  Warnings:

  - A unique constraint covering the columns `[caseId]` on the table `StsTicket` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StsTicket" ADD COLUMN     "caseId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "StsTicket_caseId_key" ON "StsTicket"("caseId");

-- AddForeignKey
ALTER TABLE "StsTicket" ADD CONSTRAINT "StsTicket_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
