-- CreateTable
CREATE TABLE "DirectChatThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectChatParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "DirectChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectChatThread_tenantId_updatedAt_idx" ON "DirectChatThread"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectChatParticipant_userId_idx" ON "DirectChatParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectChatParticipant_threadId_userId_key" ON "DirectChatParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "DirectChatMessage_threadId_createdAt_idx" ON "DirectChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectChatMessage_tenantId_createdAt_idx" ON "DirectChatMessage"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "DirectChatThread" ADD CONSTRAINT "DirectChatThread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatThread" ADD CONSTRAINT "DirectChatThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatParticipant" ADD CONSTRAINT "DirectChatParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatParticipant" ADD CONSTRAINT "DirectChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatMessage" ADD CONSTRAINT "DirectChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatMessage" ADD CONSTRAINT "DirectChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatMessage" ADD CONSTRAINT "DirectChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
