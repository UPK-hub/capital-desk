/*
  Warnings:

  - You are about to drop the column `associatedCost` on the `CorrectiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `dateDeliveredMfr` on the `CorrectiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `inStock` on the `CorrectiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `productionSp` on the `CorrectiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `commCableState` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageCardBusOpen` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageCardMasterOff` on the `PreventiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `voltageCardMasterOn` on the `PreventiveReport` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BusEquipment" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "model" TEXT;

-- AlterTable
ALTER TABLE "CorrectiveReport" DROP COLUMN "associatedCost",
DROP COLUMN "dateDeliveredMfr",
DROP COLUMN "inStock",
DROP COLUMN "productionSp",
ADD COLUMN     "dateDelivered" TIMESTAMP(3),
ADD COLUMN     "photoSerialCurrent" TEXT,
ADD COLUMN     "photoSerialNew" TEXT;

-- AlterTable
ALTER TABLE "PreventiveReport" DROP COLUMN "commCableState",
DROP COLUMN "voltageCardBusOpen",
DROP COLUMN "voltageCardMasterOff",
DROP COLUMN "voltageCardMasterOn",
ADD COLUMN     "voltageChargeController" TEXT;
