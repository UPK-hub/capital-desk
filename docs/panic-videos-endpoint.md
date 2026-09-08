# Endpoint de cargue de videos de botón de pánico

Documento de integración para el proveedor de los equipos NVR / ETB.
Versión 1.0 · Capital Desk (mesa de ayuda CapitalBus) · UP KEEP SERVICES S.A.S.

## 1. Alcance

Los NVR instalados en los buses deben entregar a la mesa de ayuda, ante cada
activación del botón de pánico, el material de video de las cámaras del vehículo:
un clip por cámara que cubre **1 minuto antes y 4 minutos después** de la
activación (5 minutos por cámara). Los buses de la flota tienen **13 cámaras**,
de modo que cada evento genera hasta 13 peticiones.

La mesa expone un único punto de recepción. El material se almacena en los
servidores dedicados (CBSTS1 / CBSTS2) y queda disponible para revisión y
tratamiento en Capital Desk.

## 2. Punto de recepción

```
POST https://<host-de-la-mesa>/api/integrations/panic-videos
```

- Un clip por petición. Un evento de botón de pánico genera tantas peticiones
  como cámaras tenga el vehículo (13 en la flota actual).
- Todas las peticiones del mismo evento deben enviar **el mismo `eventid`**: es
  la clave con la que la mesa agrupa los clips y verifica que el cargue quedó
  completo.

## 3. Autenticación

Cabecera obligatoria en cada petición:

```http
x-integration-secret: <secreto entregado por la mesa>
x-tenant-code: CAPITALBUS
```

Sin la cabecera `x-integration-secret` correcta, la mesa responde `401` y no
almacena nada. El secreto se entrega por canal seguro y puede rotarse; la mesa
avisa con anticipación cuando eso ocurra.

## 4. Modos de envío

### 4.1 Modo A — binario (recomendado)

El cuerpo de la petición es el archivo de video, sin envolver. Los metadatos
viajan en la query string (o en cabeceras `x-panic-<parámetro>`).

```
POST /api/integrations/panic-videos?eventid=1234567&vehicleid=CB-1032&channel=1
     &eventtime=2026-09-08T14:32:10-05:00&duration=300&deviceid=NVR-0451
     &lat=4.6512&lon=-74.0931&speed=32.4&filename=CB1032_cam1.mp4
Content-Type: video/mp4
Content-Length: 78451200
x-integration-secret: <secreto>
x-tenant-code: CAPITALBUS

<bytes del archivo .mp4>
```

Este es el modo recomendado: la mesa escribe el archivo directamente en disco a
medida que lo recibe (sin límite práctico de tamaño) y valida que los bytes
recibidos coincidan con `Content-Length`, que es la garantía de que el clip llegó
completo.

Ejemplo con `curl`:

```bash
curl -X POST "https://<host>/api/integrations/panic-videos?eventid=1234567&vehicleid=CB-1032&channel=1&eventtime=2026-09-08T14:32:10-05:00&duration=300" \
  -H "x-integration-secret: <secreto>" \
  -H "x-tenant-code: CAPITALBUS" \
  -H "Content-Type: video/mp4" \
  --data-binary @CB1032_cam1.mp4
```

### 4.2 Modo B — multipart (compatibilidad)

Se mantiene por compatibilidad con la integración existente. El archivo va en el
campo `file` y los metadatos como campos de texto del mismo formulario.

```bash
curl -X POST "https://<host>/api/integrations/panic-videos" \
  -H "x-integration-secret: <secreto>" \
  -H "x-tenant-code: CAPITALBUS" \
  -F "file=@CB1032_cam1.mp4;type=video/mp4" \
  -F "eventid=1234567" -F "vehicleid=CB-1032" -F "channel=1" \
  -F "eventtime=2026-09-08T14:32:10-05:00" -F "duration=300"
```

Limitación: en este modo el archivo se procesa completo en memoria, por lo que
el tope por clip es de **512 MB** (configurable). Para clips de 5 minutos de
varias cámaras se recomienda el Modo A.

## 5. Parámetros

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `eventid` | Sí | Identificador de la activación en el NVR (registro o alarma). Igual para todos los clips del mismo evento. Es la clave de agrupación e idempotencia. |
| `vehicleid` | Sí | Código del bus o placa. La mesa lo normaliza y lo empareja con su inventario. |
| `channel` | Sí | Número de cámara (1..13). Permite saber qué cámaras faltan por llegar. |
| `eventtime` | Sí | Fecha y hora de la activación del botón. ISO 8601 con zona (`2026-09-08T14:32:10-05:00`) o epoch en segundos/milisegundos. |
| `deviceid` | Recomendado | Serial o identificador del NVR. |
| `duration` | Recomendado | Duración del clip en segundos (nominal: 300). |
| `starttime` / `endtime` | Recomendado | Inicio y fin del clip. |
| `lat` / `lon` | Recomendado | Coordenadas en el momento de la activación (grados decimales). |
| `speed` | Opcional | Velocidad en km/h. |
| `alarmcode` / `alarmlabel` | Opcional | Código y descripción de la alarma según el NVR. |
| `filename` | Opcional | Nombre original del archivo. |
| `checksum` | Opcional | MD5 o SHA-256 del archivo, para verificación de integridad. |
| `expectedclips` | Opcional | Número de cámaras que se enviarán para ese evento. Si no se envía, la mesa asume 13. |
| `tenantcode` | Opcional | Alternativa a la cabecera `x-tenant-code`. |

Formato del archivo: `.mp4` (H.264/H.265). Tamaño máximo por clip: 2 GB.

## 6. Respuestas

| Código | Significado | Acción del NVR |
|---|---|---|
| `201` | Clip almacenado correctamente. | Continuar con la siguiente cámara. |
| `200` con `duplicate: true` | Ese clip (mismo evento y cámara) ya estaba almacenado. | No reenviar. |
| `401` | Secreto ausente o inválido. | No reintentar; escalar. |
| `400` | Falta un parámetro obligatorio o el cuerpo viene vacío. | Corregir y reenviar. |
| `413` | El clip supera el máximo permitido en modo multipart. | Reenviar en Modo A. |
| `422` | El cargue llegó incompleto (bytes recibidos distintos de `Content-Length`, archivo demasiado pequeño). | **Reintentar el envío de ese clip.** |
| `507` | Sin espacio de almacenamiento disponible. | Reintentar más tarde; la mesa recibe alerta. |
| `500` | Error al almacenar. | Reintentar con espera progresiva. |

Respuesta exitosa (ejemplo):

```json
{
  "ok": true,
  "eventId": "clx8...",
  "externalEventId": "1234567",
  "clipId": "clx9...",
  "busCode": "CB-1032",
  "busMatched": true,
  "channel": 1,
  "storage": "cbsts1",
  "bytesWritten": 78451200,
  "receivedClips": 3,
  "expectedClips": 13,
  "complete": false
}
```

## 7. Política de reintentos exigida al dispositivo

Para garantizar el cargue de los 5 minutos de cada cámara:

1. Reintentar ante `422`, `500`, `507` y ante error de red o corte de conexión.
2. Esquema de espera progresiva sugerido: 1, 5, 15, 30 y 60 minutos; luego cada
   hora hasta 24 horas.
3. El reenvío debe conservar el mismo `eventid` y `channel`. La mesa es
   idempotente: un clip ya almacenado y completo no se duplica (responde `200`
   con `duplicate: true`).
4. El material debe permanecer en el NVR hasta recibir una respuesta `201` o
   `200` para ese clip.

## 8. Envío de las 13 cámaras

Para no saturar el enlace del vehículo ni el de la mesa, se solicita al
dispositivo:

1. Enviar los clips del evento **de forma secuencial**, no las 13 cámaras en
   paralelo.
2. Priorizar el orden de envío según la relevancia definida por la operación
   (por ejemplo, puesto de conducción y puertas primero), de modo que el material
   más útil esté disponible en la mesa aunque el resto tarde.
3. Mantener el evento abierto en el NVR hasta confirmar la recepción de las 13
   cámaras; las faltantes quedan visibles en la mesa como cargue incompleto.

Si la operación decide que no se requieren las 13 cámaras en cada activación,
puede definirse un subconjunto fijo de canales y declararlo en `expectedclips`.

## 9. Verificación desde la mesa

Cada evento muestra en Capital Desk el indicador `recibidas/esperadas` de
cámaras. Un evento con cámaras faltantes queda marcado como cargue incompleto y
es visible en el filtro correspondiente, de modo que la mesa puede exigir el
reenvío.

## 10. Prueba de conexión

```bash
curl -i "https://<host>/api/integrations/panic-videos"
```

Responde `200` con la identificación del endpoint. Para una prueba real de
cargue se acuerda con la mesa un `eventid` de prueba (prefijo `TEST-`).
