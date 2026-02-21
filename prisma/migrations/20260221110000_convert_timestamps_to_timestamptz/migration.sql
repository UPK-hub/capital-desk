-- Migra todas las columnas timestamp without time zone a timestamptz(3)
-- Asume que los valores almacenados representan instantes en UTC.
-- Esto evita desfases al consultar en zona horaria America/Bogota.

DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> '_prisma_migrations'
      AND c.data_type = 'timestamp without time zone'
    ORDER BY c.table_name, c.ordinal_position
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamptz(3) USING %I AT TIME ZONE ''UTC''',
      col.table_schema,
      col.table_name,
      col.column_name,
      col.column_name
    );
  END LOOP;
END $$;
