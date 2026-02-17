# Integración HTTP de Tramas

Base path:
- `POST /api/integrations/tramas`
- `POST /api/cron/integrations-tramas-process`

## Seguridad
- Recomendado: configurar `INTEGRATION_INGEST_SECRET` y enviar header `x-integration-secret`.
- En fallback (sin secreto) solo permite sesión `ADMIN`/`BACKOFFICE`.

## Resolución de tenant
El tenant se resuelve en este orden:
1. `tenantCode` en body
2. header `x-tenant-code`
3. `INTEGRATION_DEFAULT_TENANT_CODE`
4. tenant de la sesión (si aplica fallback por sesión)

## Payload de ingesta
Soporta:
- un evento
- `{ event: ... }`
- `{ events: [...] }`
- `[...]`

Evento canónico:

```json
{
  "externalId": "bus123-2026-02-17T10:00:00Z-1",
  "busCode": "K123",
  "kind": "TRAMAS",
  "eventType": "CANBUS_OFFLINE",
  "severity": "HIGH",
  "message": "Sin transmisión",
  "eventAt": "2026-02-17T10:00:00Z",
  "timeline": true,
  "payload": {
    "raw": "..."
  }
}
```

Evento ETB crudo (también soportado, sin transformación previa):

```json
{
  "idRegistro": "2026021205213700",
  "idOperador": "K1",
  "idVehiculo": "K1515",
  "fechaHoraLecturaDato": "12/02/2026 05:21:37.00",
  "fechaHoraEnvioDato": "12/02/2026 05:21:37.00",
  "tipoTrama": 2,
  "codigoEvento": "EV13",
  "localizacionVehiculo": {
    "latitud": "4.63049",
    "longitud": "-74.1732"
  }
}
```

Mapeo automático ETB -> canónico:
- `externalId = idRegistro`
- `busCode = idVehiculo`
- `eventType = codigoEvento` (o `TRAMA_<tipoTrama>`)
- `eventAt = fechaHoraLecturaDato` (fallback `fechaHoraEnvioDato`)
- `payload = objeto completo recibido`
- `timeline = true` cuando `tipoTrama=2` o trae `codigoEvento`

Envelope opcional:

```json
{
  "tenantCode": "CAPITALBUS",
  "source": "etb-http",
  "processInline": false,
  "processLimit": 200,
  "events": [ ... ]
}
```

## Qué guarda
1. `IntegrationInboundEvent` (staging crudo, deduplicado por `tenantId + externalId`)
2. `BusTelemetryState` (último estado por bus) al procesar
3. `BusLifecycleEvent` solo para eventos relevantes (alertas/pánico/offline/high severity) al procesar

## Proceso batch
`POST /api/cron/integrations-tramas-process`

Body opcional:

```json
{
  "tenantCode": "CAPITALBUS",
  "limitPerTenant": 500,
  "maxTenants": 20
}
```

Autenticación:
- `x-cron-secret` con `CRON_SECRET`, o
- sesión `ADMIN/BACKOFFICE` si no hay secreto.
