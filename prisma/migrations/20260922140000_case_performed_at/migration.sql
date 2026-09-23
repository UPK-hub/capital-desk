-- Fecha de realización del trabajo (principalmente preventivos).
--
-- Un preventivo ejecutado el 31 de agosto que el técnico cargó y cerró el 1 de
-- septiembre debía seguir contando en agosto. Este campo permite corregir esa
-- fecha desde el detalle del caso. Si queda en NULL, la fecha de realización es
-- la de creación del caso, que es el comportamiento por defecto.

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "performedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Case_tenantId_type_performedAt_idx" ON "Case"("tenantId", "type", "performedAt");
