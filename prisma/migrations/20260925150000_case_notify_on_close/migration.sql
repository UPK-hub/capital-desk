-- Contacto del cliente al que se le avisa cuando una novedad se cierra.
--
-- El cliente reporta las novedades (cámaras offline, etc.) y quiere enterarse
-- del cierre sin tener que entrar a consultar. Se guarda en el caso, se puede
-- precargar al importar el reporte y cambiar después desde el detalle.

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "notifyOnCloseUserId" TEXT;

-- CreateIndex
CREATE INDEX "Case_notifyOnCloseUserId_idx" ON "Case"("notifyOnCloseUserId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_notifyOnCloseUserId_fkey"
  FOREIGN KEY ("notifyOnCloseUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
