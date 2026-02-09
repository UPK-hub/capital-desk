/*
  Warnings:

  - You are about to drop the column `responsibleSkg` on the `PreventiveReport` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PreventiveReport" DROP COLUMN "responsibleSkg",
ADD COLUMN     "responsibleUpk" TEXT;
