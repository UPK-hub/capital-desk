-- Tipo de notificación para el cierre de una novedad.
-- Va en su propia migración porque agregar un valor a un enum de PostgreSQL es
-- una operación aparte: si el motor la rechazara, el resto del cambio no se ve
-- afectado y basta con ejecutarla suelta.
ALTER TYPE "NotificationType" ADD VALUE 'CASE_CLOSED';
