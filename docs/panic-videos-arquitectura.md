# Arquitectura — videos de botón de pánico

Capital Desk · CapitalBus · septiembre de 2026

## 1. Requerimiento

Del cliente:

1. Garantizar el cargue de los videos de 5 minutos (1 minuto antes y 4 después
   de la activación) que genera el NVR, en las **13 cámaras** que tiene cada bus.
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
PANIC_STORAGE_VOLUMES=cbsts1|V:\|500;cbsts2|W:\|500
                       clave | ruta | GB libres mínimos
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

## 4. Garantía de cargue completo

| Riesgo | Control implementado |
|---|---|
| Conexión cortada a mitad del envío | El archivo se escribe primero como `.part` y solo se renombra al nombre definitivo cuando el flujo cierra bien. Un cargue interrumpido nunca queda registrado como completo. |
| Archivo truncado | Se comparan los bytes escritos contra el `Content-Length` declarado. Si no coinciden: clip marcado `INCOMPLETO` y respuesta `422` para que el dispositivo reintente. |
| Archivo vacío o de pocos bytes | Umbral mínimo configurable (`PANIC_MIN_CLIP_BYTES`). |
| Reenvíos del dispositivo | Idempotencia por `evento + cámara`: un clip ya completo responde `200 duplicate` y no se duplica en disco. |
| Cámaras que nunca llegan | El evento lleva contador `recibidas/esperadas`; con faltantes queda marcado como incompleto y aparece en el filtro "solo incompletos". |
| Clip de duración distinta a 5 minutos | Se compara con la duración nominal (300 s ± 30 s) y se anota en el clip. |
| Consumo de memoria del servidor | La escritura es en streaming: la aplicación no carga el video en memoria (en modo multipart, que sí lo hace, el tope es de 512 MB). |

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

Cada bus tiene **13 cámaras**, de modo que una activación del botón produce hasta
13 clips de 5 minutos:

| Calidad por cámara | Tamaño por clip (5 min) | Tamaño por evento (13 cámaras) |
|---|---|---|
| D1 / 1 Mbps | ~37 MB | ~0,47 GB |
| 720p / 2 Mbps | ~75 MB | ~0,95 GB |
| 1080p / 4 Mbps | ~150 MB | ~1,95 GB |

Años cubiertos por los 11,3 TB útiles:

| Activaciones por día | 0,47 GB/evento | 0,95 GB/evento | 1,95 GB/evento |
|---|---|---|---|
| 5 | 13,5 años | 6,7 años | 3,3 años |
| 10 | 6,7 años | 3,3 años | 1,6 años |
| 20 | 3,4 años | 1,7 años | 0,8 años |
| 40 | 1,7 años | 0,8 años | 0,4 años |

Almacenamiento necesario para cumplir los 5 años completos:

| Activaciones por día | 0,47 GB/evento | 0,95 GB/evento | 1,95 GB/evento |
|---|---|---|---|
| 5 | 4,3 TB | 8,7 TB | 17,8 TB |
| 10 | 8,6 TB | 17,3 TB | 35,6 TB |
| 20 | 17,2 TB | 34,7 TB | 71,2 TB |

**Conclusión:** con 13 cámaras por bus, los 11,92 TB disponibles sostienen la
retención de 5 años solo si la operación se mantiene por debajo de unas **5 a 10
activaciones diarias en toda la flota**, y con clips de calidad media (720p o
menos). Por encima de ese rango la capacidad se agota antes de cumplir la
política.

Alternativas, en orden de conveniencia:

1. **Medir primero.** Durante el primer mes de operación, registrar el tamaño
   real de los clips y la frecuencia de activaciones (`npm run panic:almacenamiento`
   entrega ambos datos y la proyección con el ritmo observado). Las cifras de
   arriba son estimaciones de bitrate; el dato real puede ser bastante menor.
2. **Definir un subconjunto de cámaras por evento.** Si la operación acepta que
   la activación del botón se documente con, por ejemplo, 5 de las 13 cámaras
   (puesto de conducción, puertas y pasillo), el consumo baja a menos de la
   mitad y la retención de 5 años entra con holgura. Es la palanca de mayor
   efecto y no requiere hardware adicional.
3. **Reducir la calidad del clip de respaldo.** Un perfil de menor bitrate solo
   para el material que se sube por botón de pánico.
4. **Ampliar disco.** Los discos de estas VM se amplían en caliente desde VMware
   Cloud Director de ETB; es la opción si se mantiene el envío de las 13 cámaras
   y la frecuencia supera las 10 activaciones diarias.

Estas alternativas quedan como referencia técnica. La decisión sobre capacidad y
ampliación de disco es del cliente, dueño de la infraestructura: la mesa opera con
los volúmenes que se le declaren, desborda sola de uno a otro y, si ambos se
llenan, responde `507` y deja el evento marcado como incompleto para que el
material se reenvíe una vez ampliado el almacenamiento.

## 7. Modelo de datos

- `PanicEvent` — una activación del botón: bus, equipo, fecha, coordenadas,
  cámaras esperadas/recibidas, completitud, estado de gestión, responsable,
  conclusión y caso vinculado.
- `PanicVideoClip` — un clip por cámara: canal, ruta, volumen, tamaño, duración,
  estado (`COMPLETO` / `INCOMPLETO` / `RECHAZADO`) y motivo.
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

1. Confirmar con la operación si cada activación debe subir las 13 cámaras o un
   subconjunto (ver alternativas del punto 6). El valor configurado hoy es 13
   (`PANIC_EXPECTED_CLIPS`).
2. Definir con el cliente si un evento de botón de pánico debe generar además
   una novedad automática en la mesa y con qué prioridad.
3. Definir la medida de respaldo del material (ver advertencia del punto 5).
