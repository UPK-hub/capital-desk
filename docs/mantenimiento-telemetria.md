# Mantenimiento automático de telemetría

Las tablas de tramas crecen sin parar; si no se purgan ni se recalculan los
resúmenes, la app se pone lenta con el tiempo. Este runbook deja todo
automático en el servidor Windows.

## Qué hace

- **Todos los días (2:30 am):** `npm run rollup:daily` — recalcula el resumen
  de telemetría de ayer y hoy (rápido, no toca el histórico).
- **Todos los días:** llama a `/api/cron/recordatorio-resueltos` para avisar al
  grupo de Telegram los casos con 3+ días en RESUELTO sin validar (requiere
  `CRON_SECRET` en el `.env` y la app corriendo en pm2).
- **Domingos:** `npm run tramas:purge` — respalda a un archivo `.ndjson.gz`
  las tramas con más de 90 días (configurable con `TRAMAS_RETENTION_DAYS`) y
  solo si el respaldo quedó completo las borra. Los respaldos quedan en
  `backups/tramas/`.

Todo queda registrado en `logs/mantenimiento_AAAA-MM-DD.log`.

## Cómo activarlo (una sola vez)

En el servidor, PowerShell **como administrador**:

```powershell
schtasks /Create /TN "CapitalDesk-Mantenimiento" /TR "powershell -ExecutionPolicy Bypass -File C:\RUTA\AL\PROYECTO\scripts\mantenimiento-telemetria.ps1" /SC DAILY /ST 02:30 /RU SYSTEM
```

Cambiar `C:\RUTA\AL\PROYECTO` por la carpeta real donde está el proyecto
(la misma donde se hace `npm run build`).

## Cómo verificar que corre

- Revisar el log del día en `logs/`.
- Ver la tarea: `schtasks /Query /TN "CapitalDesk-Mantenimiento"`.
- Probar a mano sin esperar a la madrugada:
  `powershell -ExecutionPolicy Bypass -File scripts\mantenimiento-telemetria.ps1`

## Notas

- La purga es segura: primero respalda, y si el conteo no cuadra **no borra**.
- Para probar la purga sin borrar: `npm run tramas:purge -- --dry-run`.
- Los respaldos de `backups/tramas/` conviene copiarlos de vez en cuando a
  otro disco o a la nube.
