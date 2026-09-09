# Arquitectura — videos de botón de pánico

Capital Desk · CapitalBus · septiembre de 2026

## 1. Requerimiento

Del cliente:

1. Garantizar el cargue del material que genera el NVR ante cada activación: por
   cada una de las **13 cámaras** del bus, un clip del minuto anterior y otro de
   los cinco minutos posteriores, es decir **26 archivos por evento**.
2. Un endpoint de la mesa de ayuda al cual apunten los dispositivos NVR, con los
   parámetros de envío definidos.
3. Una vista en la mesa de trabajo para que usuarios autorizados revisen el
   material y registren su tratamiento.

Infraestructura dispuesta por el cliente (VMware Cloud Director de ETB, mismo
segmento de red):

| Servidor | Rol | Sistema | Disco | IP |
|---|---|---|---|---|
| CBSTS3 | Aplicación Capital Desk + PostgreSQL | Windows | C: y D: | (actual) |
| CBSTS1 | Almacenamiento de videos de pánico | Ubuntu 64-bit | 5,89 TB | 10.216.170.194 |
| CBSTS2 | Almacenamiento de videos de pánico (desbordamiento) | Ubuntu 64-bit | 6,03 TB | 10.216.170.195 |

Política de retención exigida: **5 años**.

## 2. Decisión de arquitectura

**El video entra por la mesa y se almacena en los servidores de almacenamiento,
montados como recurso de red.**

```
   NVR del bus
       │  HTTPS  POST /api/integrations/panic-videos   (un clip por cámara)
       ▼
   CBSTS3 — Capital Desk (Next.js)
       │  escritura en streaming (el archivo no pasa por memoria ni por el disco D:)
       ├───────────────► CBSTS1  \\10.216.170.194\panic   (volumen primario)
       └───────────────► CBSTS2  \\10.216.170.195\panic   (desbordamiento)
       │
       └─ PostgreSQL en CBSTS3: solo metadatos (evento, cámara, ruta, tamaño, estado)
```

Los bytes del video nunca se guardan en la base de datos ni en el disco de la
aplicación: la fila en PostgreSQL apunta al volumen y a la ruta relativa.

### Opciones evaluadas

| Opción | Ventajas | Desventajas | Decisión |
|---|---|---|---|
| Recurso de red (Samba/CIFS) montado en CBSTS3 | Cambio mínimo en la aplicación, operable por la mesa, reversible, un solo punto de entrada para los NVR | Depende del enlace interno y de que el montaje esté activo | **Adoptada** |
| MinIO (S3) en los servidores de almacenamiento | Escalable, URLs firmadas, replicación nativa | Un servicio más que administrar y un adaptador nuevo en la aplicación | Descartada por ahora; migración posible sin cambiar el endpoint |
| Servicio de ingesta propio en CBSTS1/CBSTS2 | El video no pasa por CBSTS3 | Dos servicios, dos puntos de falla, dos despliegues, y los NVR tendrían que conocer varias direcciones | Descartada |

La abstracción de almacenamiento quedó implementada como un **pool de
volúmenes**: la aplicación no conoce rutas fijas, solo una lista ordenada de
volúmenes con su umbral de espacio libre. Migrar a otro esquema (más discos, otro
servidor, un almacenamiento de objetos) es cambiar esa lista.

## 3. Desbordamiento entre volúmenes

Variable de entorno:

```
PANIC_STORAGE_VOLUMES=cbsts1|\\10.216.170.194\panic|500|5600;cbsts2|\\10.216.170.195\panic|500|5800
                       clave | ruta o recurso de red | GB mínimos | capacidad GB
```

Regla de escritura, evaluada en cada clip:

1. Se recorre la lista en el orden declarado.
2. Se escribe en el primer volumen alcanzable cuyo espacio libre supere el mínimo
   configurado más el tamaño del archivo que se va a recibir.
3. Cuando CBSTS1 baja de su umbral, la ingesta pasa sola a CBSTS2. No hay
   intervención manual ni movimiento de archivos ya guardados.
4. Si ningún volumen tiene espacio, la mesa responde `507` y el NVR reintenta;
   el evento queda registrado como incompleto y visible en la vista.

Cada clip guarda la clave del volumen donde quedó (`cbsts1` / `cbsts2`), de modo
que la reproducción siempre resuelve la ruta correcta aunque después se agreguen
o reordenen volúmenes.

**Cómo se mide el espacio libre.** El cliente SMB de Windows no sabe informar el
espacio de un recurso de red mayor a 4 TB: devuelve siempre 4 TiB, tanto por
`statfs` como por `Scripting.FileSystemObject` (comprobado en CBSTS3 el
2026-09-08 contra los dos volúmenes, que son de 5,6 y 5,8 TB). Por eso la
aplicación detecta ese valor saturado y, en su lugar, calcula el espacio libre
como la capacidad declarada del volumen menos los bytes que ella misma ha escrito
en él, dato que sale de su propia base de datos. Donde el sistema operativo sí
informa bien (por ejemplo una ruta local), se usa el dato del sistema de
archivos. El reporte de almacenamiento indica cuál de los dos orígenes se usó.

Consecuencia operativa: esos dos volúmenes son de uso exclusivo del módulo. Si se
copian archivos ajenos, la contabilidad se desvía y el desbordamiento pierde
precisión.

## 4. Garantía de cargue completo

| Riesgo | Control implementado |
|---|---|
| Conexión cortada a mitad del envío | El archivo se escribe primero como `.part` y solo se renombra al nombre definitivo cuando el flujo cierra bien. Un cargue interrumpido nunca queda registrado como completo. |
| Archivo truncado | Se comparan los bytes escritos contra el `Content-Length` declarado. Si no coinciden: clip marcado `INCOMPLETO` y respuesta `422` para que el dispositivo reintente. |
| Archivo vacío o de pocos bytes | Umbral mínimo configurable (`PANIC_MIN_CLIP_BYTES`). |
| Reenvíos del dispositivo | Idempotencia por `evento + cámara`: un clip ya completo responde `200 duplicate` y no se duplica en disco. |
| Clips que nunca llegan | El evento lleva contador `recibidos/esperados` sobre 26; con faltantes queda marcado como incompleto y aparece en el filtro "solo incompletos". |
| Clip de duración distinta a la nominal | Se compara contra la duración esperada según el tramo (60 s el previo, 300 s el posterior, ± 30 s) y se anota en el clip. |
| Consumo de memoria del servidor | La escritura es en streaming: la aplicación no carga el video en memoria (en modo multipart, que sí lo hace, el tope es de 512 MB). |
| El sistema operativo miente sobre el espacio libre | Se detecta el valor saturado del cliente SMB de Windows y se calcula el espacio con la capacidad declarada menos lo escrito. |

## 5. Retención de 5 años

- La aplicación **no elimina** material de botón de pánico: no existe acción de
  borrado en la interfaz ni tarea automática de purga. El script de purga de
  videos existente (`videos:purgar`) opera sobre las descargas de video
  solicitadas, en otra ruta, y no toca este material.
- Cada evento muestra la fecha "conservar hasta" (recepción + 5 años).
- La eliminación pasada la retención es una decisión administrativa, ejecutada de
  forma deliberada por la mesa; no se automatiza.

**Advertencia técnica:** dos servidores dan capacidad, no redundancia. Con una
obligación de conservar cinco años, la pérdida de un volumen es pérdida
definitiva del material que contenga. Se recomienda al cliente definir, sobre la
infraestructura de ETB, una de estas medidas: instantáneas periódicas de los
discos, copia a un tercer destino, o RAID/replicación a nivel de la plataforma.

## 6. Dimensionamiento

Capacidad total del pool: 5,89 TB + 6,03 TB = **11,92 TB** (aproximadamente
11,3 TB útiles después del sistema de archivos y de los umbrales de reserva).

Cada activación produce **26 archivos**: por cada una de las 13 cámaras, un clip
del minuto previo y otro de los cinco minutos posteriores, es decir seis minutos
de video por cámara y 78 minutos por evento.

Dato real medido sobre una trama del NVR (septiembre de 2026): clip de 300
segundos, 1280x720, bitrate 2048 kbps, **37,1 MB**. Con ese perfil el clip previo
pesa alrededor de 7,4 MB.

| Perfil por cámara | Clip previo (1 min) | Clip posterior (5 min) | Evento completo (13 cámaras) |
|---|---|---|---|
| 1 Mbps | ~7,5 MB | ~37 MB | ~0,58 GB |
| 2 Mbps (perfil actual) | ~15 MB | ~74 MB | ~1,13 GB |
| 4 Mbps | ~30 MB | ~150 MB | ~2,29 GB |

Nota: el dato medido de 37,1 MB para 300 segundos corresponde a 2048 kbps
nominales con un promedio real cercano a 1 Mbps, de modo que el consumo por
evento se ubica hoy alrededor de **0,58 GB**.

Años cubiertos por los 11,3 TB útiles:

| Activaciones por día | 0,58 GB/evento | 1,13 GB/evento | 2,29 GB/evento |
|---|---|---|---|
| 5 | 10,7 años | 5,5 años | 2,7 años |
| 10 | 5,3 años | 2,7 años | 1,4 años |
| 20 | 2,7 años | 1,4 años | 0,7 años |
| 40 | 1,3 años | 0,7 años | 0,3 años |

Almacenamiento necesario para cumplir los 5 años completos:

| Activaciones por día | 0,58 GB/evento | 1,13 GB/evento | 2,29 GB/evento |
|---|---|---|---|
| 5 | 5,3 TB | 10,3 TB | 20,9 TB |
| 10 | 10,6 TB | 20,6 TB | 41,8 TB |
| 20 | 21,2 TB | 41,2 TB | 83,6 TB |

**Conclusión:** con el perfil de video actual, los 11,92 TB disponibles sostienen
la retención de cinco años mientras la operación se mantenga alrededor de diez
activaciones diarias en toda la flota. Por encima de ese ritmo hay que ampliar
disco, cosa que en estas máquinas se hace en caliente desde VMware Cloud
Director.

La decisión sobre capacidad y ampliación es del cliente, dueño de la
infraestructura: la mesa opera con los volúmenes que se le declaren, desborda
sola de uno a otro y, si ambos se llenan, responde `507` y deja el evento marcado
como incompleto para que el material se reenvíe una vez ampliado el
almacenamiento. El comando `npm run panic:almacenamiento` entrega el consumo real
observado y la proyección correspondiente.

## 7. Modelo de datos

- `PanicEvent` — una activación del botón: bus, equipo, fecha, coordenadas,
  cámaras esperadas/recibidas, completitud, estado de gestión, responsable,
  conclusión y caso vinculado.
- `PanicVideoClip` — un clip por cámara y tramo: código de cámara del NVR
  (`BV1-4`), vagón, número, tramo (`PREVIO` / `POSTERIOR`), ruta, volumen,
  tamaño, duración, estado (`COMPLETO` / `INCOMPLETO` / `RECHAZADO`) y motivo.
  La unicidad es evento + cámara + tramo, de modo que los dos clips de una misma
  cámara conviven y un reenvío no duplica material.
- `PanicEventLog` — bitácora: recepción de clips, fallas de cargue, cambios de
  estado, asignaciones, comentarios y vinculación con casos.

## 8. Control de acceso

El material es sensible: solo se ve con permiso explícito.

- `PANIC_REVIEW` — consultar y reproducir.
- `PANIC_MANAGE` — además, tratar el evento (asignar, cambiar estado, registrar
  la conclusión, vincular un caso).
- El administrador tiene ambos. Los permisos se asignan por usuario en
  Administración → Usuarios.

Los archivos no se exponen por ruta pública: se sirven a través de un endpoint
que valida sesión y permiso en cada solicitud, con soporte de reproducción
parcial (Range) para que el navegador no tenga que descargar el clip completo.

## 9. Puntos abiertos

1. Seguimiento del consumo real durante el primer mes para contrastar la
   proyección de capacidad (`npm run panic:almacenamiento`).
2. Definir con el cliente si un evento de botón de pánico debe generar además
   una novedad automática en la mesa y con qué prioridad.
3. Definir la medida de respaldo del material (ver advertencia del punto 5).
