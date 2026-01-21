/*
  Warnings:

  - Made the column `caseNo` on table `Case` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workOrderNo` on table `WorkOrder` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Case" ALTER COLUMN "caseNo" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "workOrderNo" SET NOT NULL;
