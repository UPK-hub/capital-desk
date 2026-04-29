# Integración HTTP de Tramas

Base path:
- `POST /api/integrations/tramas`
- `POST /api/cron/integrations-tramas-process`

Integracion relacionada:
- Videos recibidos por dispositivo: `docs/integrations-videos.md`

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
- `tipoTrama=1 => kind=TRAMAS` y `eventType=P20|P60`
  - `P20` cuando despues de `tipoFreno` solo vienen los campos fijos:
    - `velocidadVehiculo`
    - `aceleracionVehiculo`
  - `P60` cuando despues de `tipoFreno` aparece cualquier otro campo adicional
- `tipoTrama=2 => kind=EVENTOS` y `eventType=EVENTO:<codigo>`
- `tipoTrama=3 => kind=ALARMAS` y `eventType=ALARMA:<codigo>`
- `severity`:
  - tipo 2 desde `nivelEvento|severidadEvento|severity|nivel` (si existe)
  - tipo 3 desde `nivelAlarma|nivel|severidad|severity|prioridad` (si existe)
  - normaliza `NIV1..NIV5` y `N1..N5` a `N1..N5`
    - `N1` Critico Superior
    - `N2` Tolerable Superior
    - `N3` Normal (no genera alarma)
    - `N4` Tolerable Inferior
    - `N5` Critico Inferior
- `eventAt = fechaHoraLecturaDato` (fallback `fechaHoraEnvioDato`)
- `payload = objeto completo recibido`
- `timeline = true` para `tipoTrama=2` y `tipoTrama=3`

Catalogo de tipo 3 (ALARMAS):
- `ALA1` Aceleracion Brusca
- `ALA2` Frenada Brusca
- `ALA3` Exceso de velocidad
- `ALA4` Exceso de Peso
- `ALA5` Ausencia imagen camara del conductor
- `ALA6` Ausencia de imagen de alguna camara de CCTV distinta a la del conductor
- `ALA7` Giro Brusco

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
   - Campos clasificados/indexados para consulta rapida:
     - `tramaType`, `tramaSubtype`
     - `eventCode`, `eventLabel`
     - `alarmCode`, `alarmLabel`, `alarmLevelCode`, `alarmLevelLabel`
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
