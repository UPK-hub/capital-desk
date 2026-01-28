-- CreateTable
CREATE TABLE "CaseChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseChatMessage_caseId_createdAt_idx" ON "CaseChatMessage"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseChatMessage_tenantId_createdAt_idx" ON "CaseChatMessage"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseChatMessage" ADD CONSTRAINT "CaseChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseChatMessage" ADD CONSTRAINT "CaseChatMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseChatMessage" ADD CONSTRAINT "CaseChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
