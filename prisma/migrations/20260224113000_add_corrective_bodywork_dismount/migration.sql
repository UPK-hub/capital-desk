ALTER TABLE "CorrectiveReport"
ADD COLUMN "bodyworkDismountRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bodyworkDismountNotes" TEXT,
ADD COLUMN "photoBodyworkDismount" TEXT;
