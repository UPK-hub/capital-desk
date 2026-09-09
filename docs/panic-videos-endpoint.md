# Endpoint de cargue de videos de botón de pánico

Documento de integración para el proveedor de los equipos NVR / ETB.
Versión 1.0 · Capital Desk (mesa de ayuda CapitalBus) · UP KEEP SERVICES S.A.S.

## 1. Alcance

Los NVR instalados en los buses deben entregar a la mesa de ayuda, ante cada
activación del botón de pánico, el material de video de las cámaras del vehículo.
Cada cámara envía **dos clips**: el **minuto anterior** a la activación y los
**cinco minutos posteriores**. Los buses de la flota tienen **13 cámaras**, de
modo que cada activación genera **26 peticiones** (13 clips previos y 13
posteriores).

La mesa expone un único punto de recepción. El material se almacena en los
servidores dedicados (CBSTS1 / CBSTS2) y queda disponible para revisión y
tratamiento en Capital Desk.

## 2. Punto de recepción

```
POST https://<host-de-la-mesa>/api/integrations/panic-videos
```

- Un clip por petición. Una activación genera 26 peticiones: dos por cada una de
  las 13 cámaras.
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
POST /api/integrations/panic-videos?eventid=20260909110654001&vehicleid=K1488&camera=BV1-4
     &segment=posterior&eventtime=2026-09-08T14:32:10-05:00&duration=300&deviceid=NVR-0451
     &lat=4.63205&lon=-74.1748&filename=BV1-4EV909-09-2026-11_05_54-5MIN.mp4
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
curl -X POST "https://<host>/api/integrations/panic-videos?eventid=1234567&vehicleid=K1488&camera=BV1-4&segment=posterior&eventtime=2026-09-08T14:32:10-05:00&duration=300" \
  -H "x-integration-secret: <secreto>" \
  -H "x-tenant-code: CAPITALBUS" \
  -H "Content-Type: video/mp4" \
  --data-binary @BV1-4EV909-09-2026-11_05_54-5MIN.mp4
```

### 4.2 Modo B — multipart (compatibilidad)

Se mantiene por compatibilidad con la integración existente. El archivo va en el
campo `file` y los metadatos como campos de texto del mismo formulario.

```bash
curl -X POST "https://<host>/api/integrations/panic-videos" \
  -H "x-integration-secret: <secreto>" \
  -H "x-tenant-code: CAPITALBUS" \
  -F "file=@BV1-4EV909-09-2026-11_05_54-5MIN.mp4;type=video/mp4" \
  -F "eventid=20260909110654001" -F "vehicleid=K1488" -F "camera=BV1-4" -F "segment=posterior" \
  -F "eventtime=2026-09-08T14:32:10-05:00" -F "duration=300"
```

Limitación: en este modo el archivo se procesa completo en memoria, por lo que
el tope por clip es de **512 MB** (configurable). Para clips de 5 minutos de
varias cámaras se recomienda el Modo A.

## 5. Parámetros

La mesa acepta tanto los nombres de esta especificación como los que el NVR ya
emite en sus tramas, de modo que no es necesario renombrar lo que el equipo
produce hoy. Equivalencias reconocidas:

| Nombre en la trama del NVR | Equivale a |
|---|---|
| `idRegistroEvento` | `eventid` |
| `idVehiculo` | `vehicleid` |
| `codigoCamara` | `camera` |
| `codigoEvento` | `alarmcode` |
| `nombreArchivoVideo` | `filename` |
| `infoVideo_duration` | `duration` |
| `infoVideo_fechaInicioGrabacion` | `starttime` |
| `infoVideo_fechaFinGrabacion` | `endtime` |
| `idOcurrenciaEvento` / `fechaHoraHistorico` | `eventtime` |
| `localizacionVehiculo_latitud` / `_longitud` | `lat` / `lon` |
| `md5Hash` | `checksum` |
| `size` | tamaño declarado del archivo |

Las fechas se aceptan en el formato de las tramas (`09/09/2026 11:34:21.00`,
hora local de Bogotá) o en ISO 8601 con zona.


| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `eventid` | Sí | Identificador de la activación en el NVR (registro o alarma). Igual para todos los clips del mismo evento. Es la clave de agrupación e idempotencia. |
| `vehicleid` | Sí | Código del bus o placa. La mesa lo normaliza y lo empareja con su inventario. |
| `camera` | Sí | Código de la cámara tal como lo maneja el NVR, por ejemplo `BV1-4` (vagón 1, cámara 4). Se acepta también el nombre `codigoCamara`. Alternativamente puede enviarse `channel` con el número de cámara. |
| `segment` | Sí | Tramo del clip: `previo` (el minuto anterior a la activación) o `posterior` (los cinco minutos siguientes). Junto con `eventid` y `camera` identifica el clip de forma única. Si no se envía, la mesa lo deduce del nombre del archivo (`...-1MIN.mp4` o `...-5MIN.mp4`), de las marcas de tiempo o de la duración; aun así se recomienda declararlo. |
| `eventtime` | Sí | Fecha y hora de la activación del botón. ISO 8601 con zona (`2026-09-08T14:32:10-05:00`) o epoch en segundos/milisegundos. |
| `deviceid` | Recomendado | Serial o identificador del NVR. |
| `duration` | Recomendado | Duración del clip en segundos: 60 para el tramo previo y 300 para el posterior. |
| `starttime` / `endtime` | Recomendado | Inicio y fin del clip. |
| `lat` / `lon` | Recomendado | Coordenadas en el momento de la activación (grados decimales). |
| `speed` | Opcional | Velocidad en km/h. |
| `alarmcode` / `alarmlabel` | Opcional | Código y descripción de la alarma según el NVR. |
| `filename` | Opcional | Nombre original del archivo. |
| `checksum` | Opcional | MD5 o SHA-256 del archivo, para verificación de integridad. |
| `expectedclips` | Opcional | Número total de clips que se enviarán para esa activación. Si no se envía, la mesa asume 26. |
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
  "externalEventId": "20260909110654001",
  "clipId": "clx9...",
  "busCode": "K1488",
  "busMatched": true,
  "channel": 1,
  "storage": "cbsts1",
  "bytesWritten": 78451200,
  "channel": 4,
  "camera": "BV1-4",
  "segment": "POSTERIOR",
  "receivedClips": 3,
  "expectedClips": 26,
  "complete": false
}
```

## 7. Política de reintentos exigida al dispositivo

Para garantizar el cargue de los 5 minutos de cada cámara:

1. Reintentar ante `422`, `500`, `507` y ante error de red o corte de conexión.
2. Esquema de espera progresiva sugerido: 1, 5, 15, 30 y 60 minutos; luego cada
   hora hasta 24 horas.
3. El reenvío debe conservar el mismo `eventid`, `camera` y `segment`. La mesa
   es idempotente: un clip ya almacenado y completo no se duplica (responde `200`
   con `duplicate: true`).
4. El material debe permanecer en el NVR hasta recibir una respuesta `201` o
   `200` para ese clip.

## 8. Envío de los 26 clips

Para no saturar el enlace del vehículo ni el de la mesa, se solicita al
dispositivo:

1. Enviar los clips **de forma secuencial**, no en paralelo.
2. Priorizar los clips del tramo previo, que son cortos y llegan rápido, y luego
   los posteriores, según el orden de relevancia que defina la operación.
3. Mantener el evento abierto en el NVR hasta confirmar la recepción de los 26
   clips; los faltantes quedan visibles en la mesa como cargue incompleto.

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
