-- Corrección de la hora de las activaciones del botón de pánico registradas
-- antes de que la ingesta fijara la zona horaria de la operación.
--
-- Los primeros eventos llegaron con la marca de tiempo sin zona horaria y el
-- servidor (que corre en UTC) las interpretó como si ya fueran UTC, corriendo la
-- activación cinco horas hacia atrás: una activación de las 13:34 se guardó como
-- si hubiera ocurrido a las 08:34.
--
-- El identificador de evento del NVR lleva la marca de tiempo local de la
-- activación ("2026090913340900" = 2026-09-09 13:34:09 hora de Bogotá), así que
-- se toma como fuente de verdad. Los clips del evento se desplazan por la misma
-- diferencia para que conserven su relación con la activación.
--
-- Idempotente: los eventos que ya tienen la hora correcta no se modifican.
--
--   npx prisma db execute --file prisma/fixes/20260909_panic_horas.sql --schema prisma/schema.prisma

-- 1) Clips: se desplazan por la diferencia que tiene su evento. Debe ejecutarse
--    antes de corregir el evento, porque la diferencia se calcula contra el
--    valor que todavía está guardado.
UPDATE "PanicVideoClip" c
SET "startedAt" = c."startedAt" + d.desfase,
    "endedAt"   = c."endedAt"   + d.desfase
FROM (
  SELECT
    e.id,
    (to_timestamp(substring(e."externalEventId" FROM 1 FOR 14), 'YYYYMMDDHH24MISS')::timestamp
       AT TIME ZONE 'America/Bogota') - e."eventAt" AS desfase
  FROM "PanicEvent" e
  WHERE e."externalEventId" ~ '^[0-9]{14}'
    AND e."eventAt" IS NOT NULL
) d
WHERE c."eventId" = d.id
  AND d.desfase <> interval '0';

-- 2) Evento: se reescribe con la hora que declara el identificador del NVR.
UPDATE "PanicEvent" e
SET "eventAt" = (to_timestamp(substring(e."externalEventId" FROM 1 FOR 14), 'YYYYMMDDHH24MISS')::timestamp
                   AT TIME ZONE 'America/Bogota')
WHERE e."externalEventId" ~ '^[0-9]{14}'
  AND e."eventAt" IS NOT NULL
  AND e."eventAt" <> (to_timestamp(substring(e."externalEventId" FROM 1 FOR 14), 'YYYYMMDDHH24MISS')::timestamp
                        AT TIME ZONE 'America/Bogota');
