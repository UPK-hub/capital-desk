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
`ONEDRIVE_BATCH_SIZE` (3), `ONEDRIVE_IDLE_MS` (30000).

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
4. `pm2 stop capitaldesk tramas-processor`
5. `npm run prisma:migrate:deploy`
6. `npm run build`
7. `pm2 restart capitaldesk tramas-processor`
8. `npm run onedrive:probar`
9. Si pasa en verde, poner `ONEDRIVE_SYNC_ENABLED=true` en el `.env`.
10. `pm2 start ecosystem.config.cjs --only onedrive-sync` y `pm2 save`.

## Operación

- `npm run onedrive:probar` — valida credenciales, cuota, escritura y borrado.
- `npm run onedrive:estado` — conteo por estado y los últimos adjuntos en error.
- `npm run onedrive:sync` — una sola pasada, sin bucle, para diagnosticar.
- `pm2 logs onedrive-sync` — seguimiento en vivo.

## Capacidad

La cuenta destino tiene 5 TB. La operación genera entre 300 y 440 GB de video
al mes, así que el espacio alcanza para unos doce meses. Antes de llegar al
tope hay que decidir si se amplía la cuota o se define una retención.
