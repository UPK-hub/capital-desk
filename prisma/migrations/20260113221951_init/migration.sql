-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'BACKOFFICE', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('NOVEDAD', 'CORRECTIVO', 'PREVENTIVO', 'MEJORA_PRODUCTO', 'SOLICITUD_DESCARGA_VIDEO');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NUEVO', 'OT_ASIGNADA', 'EN_EJECUCION', 'RESUELTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('CREADA', 'ASIGNADA', 'EN_CAMPO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('FOTO_INICIO', 'FOTO_FIN');

-- CreateEnum
CREATE TYPE "CaseEventType" AS ENUM ('CREATED', 'ASSIGNED', 'NOTIFIED', 'STATUS_CHANGE', 'COMMENT');

-- CreateEnum
CREATE TYPE "FailureType" AS ENUM ('HARDWARE_FISICA', 'SOFTWARE', 'CONECTIVIDAD', 'OTRO');

-- CreateEnum
CREATE TYPE "ProcedureType" AS ENUM ('AJUSTE_FISICO', 'CAMBIO_COMPONENTE', 'RECONFIGURACION', 'REVISION', 'OTRO');

-- CreateEnum
CREATE TYPE "DeviceLocation" AS ENUM ('VAGON_1', 'VAGON_2', 'VAGON_3', 'BO', 'BFE', 'BTE', 'GABINETE_EQUIPOS', 'FUELLE_V2_3');

-- CreateEnum
CREATE TYPE "VideoReqOrigin" AS ENUM ('TRANSMILENIO_SA', 'INTERVENTORIA', 'CAPITAL_BUS', 'OTRO');

-- CreateEnum
CREATE TYPE "VideoDeliveryMethod" AS ENUM ('WINSCP', 'USB', 'ONEDRIVE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CASE_CREATED', 'CASE_ASSIGNED', 'WO_STARTED', 'WO_FINISHED', 'FORM_SAVED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusEquipment" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "equipmentTypeId" TEXT NOT NULL,
    "serial" TEXT,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BusEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "busEquipmentId" TEXT,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'NUEVO',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "CaseEventType" NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'CREADA',
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStep" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderMedia" (
    "id" TEXT NOT NULL,
    "workOrderStepId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusLifecycleEvent" (
    "id" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "busEquipmentId" TEXT,
    "caseId" TEXT,
    "workOrderId" TEXT,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveReport" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "workOrderNumber" TEXT,
    "busCode" TEXT,
    "productionSp" TEXT,
    "plate" TEXT,
    "deviceType" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "procedureType" "ProcedureType",
    "procedureOther" TEXT,
    "location" "DeviceLocation",
    "locationOther" TEXT,
    "dateDismount" TIMESTAMP(3),
    "dateDeliveredMfr" TIMESTAMP(3),
    "accessoriesSupplied" BOOLEAN NOT NULL DEFAULT false,
    "accessoriesWhich" TEXT,
    "physicalState" TEXT,
    "diagnosis" TEXT,
    "failureType" "FailureType",
    "failureOther" TEXT,
    "solution" TEXT,
    "manufacturerEta" TEXT,
    "installDate" TIMESTAMP(3),
    "newBrand" TEXT,
    "newModel" TEXT,
    "newSerial" TEXT,
    "inStock" BOOLEAN,
    "removedBrand" TEXT,
    "removedModel" TEXT,
    "removedSerial" TEXT,
    "associatedCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectiveReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventiveReport" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "workOrderNumber" TEXT,
    "biarticuladoNo" TEXT,
    "productionSp" TEXT,
    "mileage" TEXT,
    "plate" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "rescheduledAt" TIMESTAMP(3),
    "devicesInstalled" JSONB,
    "activities" JSONB,
    "voltageNvrFromCard" TEXT,
    "voltageCollectorFromCard" TEXT,
    "voltageBatteriesMasterOff" TEXT,
    "voltageCardMasterOn" TEXT,
    "voltageCardMasterOff" TEXT,
    "voltageSwitch" TEXT,
    "voltageCardBusOpen" TEXT,
    "commCableState" TEXT,
    "observations" TEXT,
    "timeStart" TEXT,
    "timeEnd" TEXT,
    "responsibleSkg" TEXT,
    "responsibleCapitalBus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventiveReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoDownloadRequest" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "origin" "VideoReqOrigin" NOT NULL,
    "requestType" TEXT,
    "tmsaRadicado" TEXT,
    "tmsaFiledAt" TIMESTAMP(3),
    "concessionaireFiledAt" TIMESTAMP(3),
    "requesterName" TEXT,
    "requesterId" TEXT,
    "requesterRole" TEXT,
    "requesterPhone" TEXT,
    "requesterEmail" TEXT,
    "vehicleId" TEXT,
    "eventStart" TIMESTAMP(3),
    "eventEnd" TIMESTAMP(3),
    "camerasRequested" TEXT,
    "deliveryMethod" "VideoDeliveryMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoDownloadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_tenantId_code_key" ON "Bus"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentType_name_key" ON "EquipmentType"("name");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_caseId_key" ON "WorkOrder"("caseId");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_status_idx" ON "WorkOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedToId_status_idx" ON "WorkOrder"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "BusLifecycleEvent_busId_occurredAt_idx" ON "BusLifecycleEvent"("busId", "occurredAt");

-- CreateIndex
CREATE INDEX "BusLifecycleEvent_busEquipmentId_occurredAt_idx" ON "BusLifecycleEvent"("busEquipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CorrectiveReport_workOrderId_key" ON "CorrectiveReport"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PreventiveReport_workOrderId_key" ON "PreventiveReport"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoDownloadRequest_caseId_key" ON "VideoDownloadRequest"("caseId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusEquipment" ADD CONSTRAINT "BusEquipment_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusEquipment" ADD CONSTRAINT "BusEquipment_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_busEquipmentId_fkey" FOREIGN KEY ("busEquipmentId") REFERENCES "BusEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStep" ADD CONSTRAINT "WorkOrderStep_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMedia" ADD CONSTRAINT "WorkOrderMedia_workOrderStepId_fkey" FOREIGN KEY ("workOrderStepId") REFERENCES "WorkOrderStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusLifecycleEvent" ADD CONSTRAINT "BusLifecycleEvent_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusLifecycleEvent" ADD CONSTRAINT "BusLifecycleEvent_busEquipmentId_fkey" FOREIGN KEY ("busEquipmentId") REFERENCES "BusEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveReport" ADD CONSTRAINT "CorrectiveReport_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventiveReport" ADD CONSTRAINT "PreventiveReport_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDownloadRequest" ADD CONSTRAINT "VideoDownloadRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
