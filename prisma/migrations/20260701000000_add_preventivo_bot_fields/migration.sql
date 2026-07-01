-- User: chat de Telegram vinculado (registro del bot de carga de preventivos)
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CasePreventiveChecklist: técnico que abrió y técnico que cerró
ALTER TABLE "CasePreventiveChecklist" ADD COLUMN "aperturaById" TEXT;
ALTER TABLE "CasePreventiveChecklist" ADD COLUMN "aperturaByName" TEXT;
ALTER TABLE "CasePreventiveChecklist" ADD COLUMN "aperturaAt" TIMESTAMPTZ(3);
ALTER TABLE "CasePreventiveChecklist" ADD COLUMN "cierreById" TEXT;
ALTER TABLE "CasePreventiveChecklist" ADD COLUMN "cierreByName" TEXT;
ALTER TABLE "CasePreventiveChecklist" ADD COLUMN "cierreAt" TIMESTAMPTZ(3);
