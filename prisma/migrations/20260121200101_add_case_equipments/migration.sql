-- CreateTable
CREATE TABLE "CaseEquipment" (
    "caseId" TEXT NOT NULL,
    "busEquipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEquipment_pkey" PRIMARY KEY ("caseId","busEquipmentId")
);

-- CreateIndex
CREATE INDEX "CaseEquipment_busEquipmentId_idx" ON "CaseEquipment"("busEquipmentId");

-- AddForeignKey
ALTER TABLE "CaseEquipment" ADD CONSTRAINT "CaseEquipment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEquipment" ADD CONSTRAINT "CaseEquipment_busEquipmentId_fkey" FOREIGN KEY ("busEquipmentId") REFERENCES "BusEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
