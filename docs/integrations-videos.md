# Integracion HTTP de videos

Endpoint:
- `POST /api/integrations/videos`

## Seguridad
- Configurar `INTEGRATION_VIDEO_SECRET` o `INTEGRATION_INGEST_SECRET`.
- El dispositivo debe enviar el header `x-integration-secret`.
- El tenant se resuelve con `x-tenant-code`, campo multipart `tenantCode` o `INTEGRATION_DEFAULT_TENANT_CODE`.

Para el codigo C++ compartido:

```env
INTEGRATION_VIDEO_SECRET=capitaldesk2026@.
INTEGRATION_DEFAULT_TENANT_CODE=CAPITALBUS
```

## Multipart esperado

Campos compatibles con el envio `curl_mime`:

- `file`: video `.mp4` obligatorio.
- `metadata`: JSON opcional, como archivo o texto.
- `filename`: nombre original opcional.
- `registerid`: id de registro opcional.
- `deviceid`: id del equipo opcional.
- `vehicleid`: codigo de bus/vehiculo opcional.

Headers:

```http
x-integration-secret: <secreto>
x-tenant-code: CAPITALBUS
Accept: application/json
```

Respuesta exitosa:

```json
{
  "ok": true,
  "id": "cuid",
  "tenant": "CAPITALBUS",
  "busMatched": true,
  "filePath": "integration-videos/CAPITALBUS/2026-04-27/...",
  "videoUrl": "/api/uploads/integration-videos/CAPITALBUS/2026-04-27/..."
}
```

## Consulta

Los videos recibidos quedan en:

- `Videos > Recibidos`
- URL: `/video-requests/received`

Cada registro guarda el archivo, metadatos JSON, bus detectado por `vehicleid`, `deviceid`, `registerid`, tamano y fecha de recepcion.
