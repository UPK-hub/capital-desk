# Réplica automática de videos al OneDrive de CapitalBus

Los videos que los técnicos cargan en las solicitudes de descarga se copian
automáticamente al OneDrive de la cuenta de servicio del cliente, organizados
por año, mes y caso. La copia del servidor no se toca: el disco D: sigue
funcionando igual que hoy.

## Cómo funciona

1. El técnico sube el video en `/video-requests/[id]`. La mesa lo guarda en
   disco como siempre y además marca el adjunto como `PENDIENTE`. El cargue no
   espera a Microsoft ni falla si Graph está caído.
2. El proceso `onedrive-sync` toma los pendientes, arma la ruta destino y sube
   el archivo con Microsoft Graph.
3. Solo cuando Graph confirma el `itemId` y el tamaño coincide con el del
   archivo local, el adjunto pasa a `REPLICADO` y se guarda el enlace.

Estados posibles: `PENDIENTE`, `SUBIENDO`, `REPLICADO`, `ERROR`, `OMITIDO`.
`OMITIDO` es para adjuntos eliminados en la mesa o cuyo archivo ya no está en
disco. `ERROR` es cuando se agotaron los intentos y requiere revisión.

## Estructura en el OneDrive

```
Descargas de video Capital Desk/
  2026/
    09 - Septiembre/
      BUS 5001 - CASO 1234/
        Bus5001_BV1-4_CASO-1234.mp4
```

El año y el mes salen de la **fecha de creación de la solicitud**, no de la
fecha de cargue, para que todos los videos de un caso queden en la misma
carpeta aunque se suban días después.

La carpeta del mes lleva el número delante del nombre para que el explorador la
ordene cronológicamente. Con solo el nombre, OneDrive ordenaría alfabéticamente
y quedaría Abril, Agosto, Diciembre, en ese orden.

## Subida

Archivos de hasta 4 MB van por `PUT` directo. Los videos van por sesión de
carga reanudable, en trozos de 10 MiB (múltiplo de 320 KiB, como exige
Microsoft). Si la conexión se corta, el reintento retoma la subida.

Reintentos con espera creciente desde 30 segundos hasta 30 minutos, máximo 8
intentos. Los códigos 429 y 503 respetan el encabezado `Retry-After`. Un 507
(sin cuota) no consume intentos: el adjunto se queda pendiente hasta que haya
espacio.

## Variables del `.env` del servidor

```
ONEDRIVE_SYNC_ENABLED=false
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
ONEDRIVE_DRIVE_ID=
ONEDRIVE_ROOT_FOLDER=Descargas de video Capital Desk
```

Opcionales: `ONEDRIVE_CHUNK_BYTES` (10 MiB), `ONEDRIVE_MAX_ATTEMPTS` (8),
`ONEDRIVE_BATCH_SIZE` (3), `ONEDRIVE_IDLE_MS` (30000),
`ONEDRIVE_BACKFILL_VENTANA` (`19:00-06:00`), `ONEDRIVE_DIAS_RECIENTE` (7),
`ONEDRIVE_CONCURRENCIA` (2, máximo 6).

## Ventana nocturna para el material viejo

El worker atiende con prioridad los videos cargados en los últimos
`ONEDRIVE_DIAS_RECIENTE` días: esos suben a cualquier hora, porque son los que
el cliente está esperando. El material viejo del backfill solo sube dentro de
`ONEDRIVE_BACKFILL_VENTANA`, en hora de Bogotá, para no competir con la
operación por el ancho de banda de salida del servidor.

La ventana admite cruzar la medianoche (`19:00-06:00`). Para desactivar la
restricción y que suba todo a cualquier hora, poner el valor `siempre`.

Con esto se puede encolar el histórico completo de una sola vez y olvidarse:
el worker lo irá subiendo noche tras noche sin afectar el día.

Arranque en `false` a propósito. Se enciende solo después de que
`npm run onedrive:probar` pase en verde.

## Permisos en el tenant del cliente

Aplicación registrada en Entra ID de CapitalBus con el permiso de aplicación
`Files.ReadWrite.All` de Microsoft Graph y consentimiento de administrador.

`Sites.Selected`, que sería lo deseable por ser acotado a un solo sitio, **no
es compatible con un OneDrive personal**: el endpoint
`POST /sites/{siteId}/permissions` responde `invalidRequest` sobre un sitio
`-my.sharepoint.com`. Solo funciona sobre sitios de SharePoint. Si en el futuro
se migra el destino a una biblioteca de SharePoint, se puede volver al permiso
acotado.

El secreto de cliente vence a los 24 meses. Anotar la fecha y renovarlo antes.

## Despliegue

Este cambio toca `prisma/schema.prisma`, así que la migración va antes del
build:

1. En el Mac: `git add`, `git commit`, `git push origin main`.
2. En el servidor, PowerShell como Administrador, en `D:\apps\capital-desk`:
   `git fetch origin` y `git reset --hard origin/main`.
3. Cargar las variables nuevas en el `.env`, con `ONEDRIVE_SYNC_ENABLED=false`.
4. `pm2 stop capitaldesk tramas-processor onedrive-sync`

   Los tres usan Prisma. Si alguno queda corriendo, el build falla con
   `EPERM ... unlink ... query_engine-windows.dll.node`. Si ya pasó:
   `Remove-Item -Recurse -Force .\node_modules\.prisma\client` y repetir.
5. `npm run prisma:migrate:deploy`
6. `npm run build`
7. `pm2 restart capitaldesk tramas-processor onedrive-sync`
8. `npm run onedrive:probar`
9. Si pasa en verde, poner `ONEDRIVE_SYNC_ENABLED=true` en el `.env`.
10. `pm2 start ecosystem.config.cjs --only onedrive-sync` y `pm2 save`.

## Operación

- `npm run onedrive:probar` — valida credenciales, cuota, escritura y borrado.
- `npm run onedrive:estado` — conteo por estado y los últimos adjuntos en error.
- `npm run onedrive:sync` — una sola pasada, sin bucle, para diagnosticar.
- `pm2 logs onedrive-sync` — seguimiento en vivo.

## Videos que ya estaban cargados

Los adjuntos subidos antes de que existiera este módulo tienen `odStatus` en
null, es decir no entran a la cola por sí solos. Para replicarlos se usa el
comando de backfill, que solo toma los que todavía tienen su archivo en el
disco del servidor:

```
npm run onedrive:backfill                             simula todo lo pendiente
npm run onedrive:backfill -- --limite 200             simula los 200 más viejos
npm run onedrive:backfill -- --limite 200 --apply     los encola de verdad
npm run onedrive:backfill -- --desde 2026-08-01 --hasta 2026-08-31 --apply
```

Por defecto simula: cuenta cuántos hay, cuántos GB pesan, cuántos ya no tienen
archivo en disco y muestra un ejemplo de la ruta destino. Solo con `--apply`
los marca como pendientes.

Conviene hacerlo por tandas y en horario nocturno. Una tanda de 200 videos
puede ser del orden de decenas de GB de subida y compite con la operación por
el ancho de banda de salida del servidor.

## Capacidad

La cuenta destino tiene 5 TB. La operación genera entre 300 y 440 GB de video
al mes, así que el espacio alcanza para unos doce meses. Antes de llegar al
tope hay que decidir si se amplía la cuota o se define una retención.
