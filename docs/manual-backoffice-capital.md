# Manual de Uso - Backoffice Capital Desk (Capital)

## 1. Objetivo
Este manual describe el uso diario de **Capital Desk** para el equipo **Backoffice Capital**.
Perfil objetivo: usuarios que gestionan casos, buses, videos y seguimiento de OT, con **consulta de turnos técnicos** pero **sin iniciar/cerrar turnos**.

## 2. Alcance del perfil Backoffice Capital
Módulos que sí usa:
- `Casos` (`/cases`)
- `Crear caso` (`/cases/new`)
- `Detalle de caso` (`/cases/{id}`)
- `Buses` y hoja de vida (`/buses`, `/buses/{id}`)
- `Videos` (`/video-requests`, `/video-requests/{id}`)
- `Turnos` (`/technicians/shifts`) para consulta y exportación de jornadas técnicas
- `STS` (si tiene capacidad habilitada) (`/sts`, `/sts/tickets`, `/sts/reports`)
- `Perfil` (`/profile`)

Módulos que no usa:
- `OTs técnico` (`/work-orders`) -> uso principal del técnico

## 3. Ingreso al sistema
1. Abrir URL oficial de Capital Desk.
2. Ingresar correo y contraseña.
3. Validar que el menú lateral muestre `Casos`, `Buses`, `Videos`, `Turnos`, `Perfil` y `STS` (si fue habilitado).

Si no aparece `Turnos`, reportar a administrador para ajustar permisos del perfil.

### Espacio para visuales (Word) - Ingreso
- **Figura 3-A (obligatoria)**
  Ubicación en Word: inmediatamente después de este bloque de ingreso.
  Captura sugerida: pantalla de login de Capital Desk.
  Pie sugerido: `Figura 3-A. Pantalla de ingreso a Capital Desk.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 3-B (obligatoria)**
  Ubicación en Word: debajo de la Figura 3-A.
  Captura sugerida: menú lateral del perfil Backoffice con `Casos`, `Buses`, `Videos`, `Turnos`, `Perfil` y `STS` (si aplica).
  Pie sugerido: `Figura 3-B. Menú disponible para Backoffice Capital.`
  `[PEGAR CAPTURA AQUÍ]`

## 4. Flujo operativo recomendado

### 4.1 Gestionar casos (bandeja principal)
Ruta: `/cases`

Objetivo del módulo:
- Centralizar la operación diaria de casos abiertos y cerrados.
- Priorizar qué atender primero según urgencia, tipo y estado.

Qué puedes hacer en esta vista:
1. Buscar por texto libre (código de bus, placa, número de caso o palabras del título).
2. Filtrar por:
   - Estado (`NUEVO`, `OT_ASIGNADA`, `EN_EJECUCION`, `RESUELTO`, `CERRADO`)
   - Tipo de caso
   - Prioridad
3. Limpiar filtros para volver a la vista completa.
4. Abrir cada caso para revisar detalle, trazabilidad y estado de OT.

Cómo usarla correctamente (rutina recomendada):
1. Iniciar revisando `NUEVO` y prioridades altas.
2. Validar que cada caso tenga bus asociado, descripción clara y tipo correcto.
3. Revisar `OT_ASIGNADA` y `EN_EJECUCION` para seguimiento operativo.
4. Confirmar que los casos en `RESUELTO` tengan evidencia completa antes de cierre.

Resultado esperado:
- Bandeja ordenada por prioridad operativa.
- Casos sin ambigüedad y con seguimiento actualizado.

#### Espacio para visuales (Word) - 4.1 Gestión de Casos
- **Figura 4.1-A (obligatoria)**
  Ubicación en Word: después de "Qué puedes hacer en esta vista".
  Captura sugerida: bandeja de casos con filtros visibles (estado, tipo, prioridad).
  Pie sugerido: `Figura 4.1-A. Bandeja de casos con filtros operativos.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.1-B (obligatoria)**
  Ubicación en Word: después de "Cómo usarla correctamente".
  Captura sugerida: lista de casos mostrando distintos estados (`NUEVO`, `OT_ASIGNADA`, `EN_EJECUCION`, etc.).
  Pie sugerido: `Figura 4.1-B. Estados de caso en la bandeja principal.`
  `[PEGAR CAPTURA AQUÍ]`

### 4.2 Crear caso
Ruta: `/cases/new`

Objetivo del módulo:
- Registrar un incidente o requerimiento de forma estructurada para que pueda ser atendido y trazado.

Datos que debes diligenciar:
1. **Bus**: seleccionar el vehículo correcto (código/placa).
2. **Tipo de caso**: clasificar correctamente (preventivo, correctivo, renovación u otro disponible).
3. **Prioridad**: definir impacto/urgencia real para ordenar atención.
4. **Título**: resumen breve del problema.
5. **Descripción**: detalle técnico y contexto (qué falla, desde cuándo, dónde se detectó).

Buenas prácticas al crear casos:
1. Evitar descripciones genéricas como "no funciona".
2. Incluir síntomas observables (reinicios, pérdida de video, sin comunicación, etc.).
3. Si hay dato adicional (evento, hora, componente), incluirlo en la descripción.

Validación posterior al guardado:
1. Confirmar que se generó el número de caso.
2. Verificar que el caso aparece en bandeja.
3. Abrir el detalle y validar que los campos quedaron correctamente.

Resultado esperado:
- Caso creado con información suficiente para asignación y ejecución sin reprocesos.

#### Espacio para visuales (Word) - 4.2 Crear Caso
- **Figura 4.2-A (obligatoria)**
  Ubicación en Word: después de "Datos que debes diligenciar".
  Captura sugerida: formulario de creación de caso vacío.
  Pie sugerido: `Figura 4.2-A. Formulario de creación de caso.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.2-B (obligatoria)**
  Ubicación en Word: debajo de la Figura 4.2-A.
  Captura sugerida: formulario diligenciado antes de guardar.
  Pie sugerido: `Figura 4.2-B. Ejemplo de caso diligenciado correctamente.`
  `[PEGAR CAPTURA AQUÍ]`

### 4.3 Seguimiento de caso y OT
Ruta: `/cases/{id}`

Objetivo del módulo:
- Ver el estado real de atención del caso de punta a punta (caso, OT, evidencias y validación).

Bloques clave que debes revisar:
1. **Contexto del caso**:
   - Bus asociado
   - Tipo de caso
   - Prioridad
   - Descripción original
2. **Trazabilidad**:
   - Línea de tiempo de eventos (creación, asignación, avances, cierre)
   - Usuario/rol que ejecutó cada acción
   - Fecha y hora de cada cambio
3. **Orden de Trabajo (OT)**:
   - Estado actual de la OT
   - Técnico asignado (si aplica)
   - Fechas de inicio y finalización
   - Acceso a formulario/evidencia y documentos generados (PDF/adjuntos cuando existan)

Qué validar antes de cerrar el caso:
1. Que la OT esté finalizada y consistente con el tipo de caso.
2. Que la evidencia requerida esté cargada.
3. Que no existan pendientes en trazabilidad.

Validación final (coordinador):
1. En tarjeta **Validación coordinador**, usar `Verificar OT`.
2. Al validar correctamente, se habilita cierre documental del caso.

Resultado esperado:
- Caso con ciclo completo documentado y validado para auditoría.

#### Espacio para visuales (Word) - 4.3 Seguimiento de Caso y OT
- **Figura 4.3-A (obligatoria)**
  Ubicación en Word: después de "Bloques clave que debes revisar".
  Captura sugerida: detalle del caso mostrando contexto y trazabilidad.
  Pie sugerido: `Figura 4.3-A. Vista de detalle del caso y su trazabilidad.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.3-B (obligatoria)**
  Ubicación en Word: debajo de la Figura 4.3-A.
  Captura sugerida: tarjeta de OT con estado y fechas.
  Pie sugerido: `Figura 4.3-B. Seguimiento de orden de trabajo asociada al caso.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.3-C (opcional)**
  Ubicación en Word: después de "Validación final (coordinador)".
  Captura sugerida: tarjeta "Validación coordinador" con botón `Verificar OT`.
  Pie sugerido: `Figura 4.3-C. Validación final de OT por coordinador.`
  `[PEGAR CAPTURA AQUÍ]`

### 4.4 Gestión de videos
Rutas: `/video-requests` y `/video-requests/{id}`

Acciones:
1. Revisar solicitudes por fecha y estado.
2. Abrir detalle para:
   - Ver estado de caso y descarga
   - Adjuntar evidencia si aplica
   - Registrar observaciones

#### Espacio para visuales (Word) - 4.4 Gestión de Videos
- **Figura 4.4-A (obligatoria)**
  Ubicación en Word: inmediatamente después de este bloque.
  Captura sugerida: bandeja de solicitudes de video con estados.
  Pie sugerido: `Figura 4.4-A. Bandeja de solicitudes de video.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.4-B (obligatoria)**
  Ubicación en Word: debajo de la Figura 4.4-A.
  Captura sugerida: detalle de solicitud con observaciones y adjuntos.
  Pie sugerido: `Figura 4.4-B. Detalle de solicitud de video.`
  `[PEGAR CAPTURA AQUÍ]`

### 4.5 Consulta de buses
Rutas: `/buses` y `/buses/{id}`

Objetivo del módulo:
- Consultar historial técnico del bus para tomar decisiones con contexto completo.

Qué puedes hacer en la bandeja de buses (`/buses`):
1. Buscar por código interno o placa.
2. Identificar rápidamente el bus correcto antes de abrir casos o validar información.

Qué revisar en la hoja de vida (`/buses/{id}`):
1. **Resumen del bus**: identificación principal y estado general.
2. **Casos asociados**: incidentes abiertos y cerrados vinculados al vehículo.
3. **OT derivadas**: órdenes de trabajo ejecutadas sobre ese bus.
4. **Timeline/Historial**: secuencia cronológica de eventos técnicos.

Uso recomendado:
1. Antes de crear un caso, revisar si existe historial reciente del mismo síntoma.
2. Durante seguimiento, usar la hoja de vida para entender recurrencia por componente.
3. Para reportes, validar cantidad de casos/OT por bus en una ventana de tiempo.

Resultado esperado:
- Análisis por vehículo con trazabilidad histórica y menor duplicidad de casos.

#### Espacio para visuales (Word) - 4.5 Consulta de Buses
- **Figura 4.5-A (obligatoria)**
  Ubicación en Word: después de "Qué puedes hacer en la bandeja de buses".
  Captura sugerida: listado de buses con búsqueda por placa/código.
  Pie sugerido: `Figura 4.5-A. Bandeja de buses y filtros de búsqueda.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.5-B (obligatoria)**
  Ubicación en Word: después de "Qué revisar en la hoja de vida".
  Captura sugerida: hoja de vida del bus con casos, OT y timeline.
  Pie sugerido: `Figura 4.5-B. Hoja de vida del bus con historial técnico.`
  `[PEGAR CAPTURA AQUÍ]`

### 4.6 Gestión STS (si aplica al usuario)
Rutas: `/sts`, `/sts/tickets`, `/sts/reports`

#### a) Panel operativo STS
Ruta: `/sts`

Objetivo:
- Monitorear salud operativa STS y cumplimiento de acuerdos de servicio.

Qué revisar diariamente:
1. Cumplimiento SLA de respuesta y resolución.
2. Tickets en riesgo y tickets con breach.
3. KPIs por componente (tendencia y desempeño).
4. Distribución de carga por estado/prioridad.

#### b) Tickets STS
Ruta: `/sts/tickets`

Objetivo:
- Registrar y gestionar incidentes STS con trazabilidad formal.

Acciones:
1. Crear ticket STS con:
   - Componente afectado
   - Prioridad
   - Canal
   - Descripción técnica
2. Filtrar por prioridad, estado, componente, breach o búsqueda libre.
3. Abrir detalle para:
   - Ver eventos del ticket
   - Registrar actualizaciones
   - Confirmar cambios de estado hasta cierre

#### c) Reportes STS
Ruta: `/sts/reports`

Objetivo:
- Analizar desempeño STS por periodos y soportar comités operativos.

Acciones:
1. Consultar resumen por ventana (7/30/90 días u otras disponibles).
2. Revisar indicadores de:
   - Severidad
   - Estado
   - Breaches
   - Tiempos medios
3. Exportar información cuando se requiera consolidado externo.

#### d) Configuración STS (solo usuarios autorizados)
Ruta: `/sts/admin`

Incluye:
1. Componentes STS.
2. Políticas SLA.
3. KPIs y ventanas de mantenimiento.

Nota: este módulo es para perfil con permiso administrativo STS.

Resultado esperado de STS:
- Operación controlada con medición continua y evidencia clara de cumplimiento.

#### Espacio para visuales (Word) - 4.6 Gestión STS
- **Figura 4.6-A (obligatoria)**
  Ubicación en Word: después del bloque `a) Panel operativo STS`.
  Captura sugerida: dashboard STS con KPIs y cumplimiento SLA.
  Pie sugerido: `Figura 4.6-A. Panel operativo STS y cumplimiento SLA.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.6-B (obligatoria)**
  Ubicación en Word: después del bloque `b) Tickets STS`.
  Captura sugerida: lista de tickets STS con filtros y estados.
  Pie sugerido: `Figura 4.6-B. Gestión de tickets STS.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.6-C (obligatoria)**
  Ubicación en Word: después del bloque `c) Reportes STS`.
  Captura sugerida: reporte STS por ventana de tiempo.
  Pie sugerido: `Figura 4.6-C. Reportes STS por periodo.`
  `[PEGAR CAPTURA AQUÍ]`

### 4.7 Turnos técnicos (Backoffice)
Ruta: `/technicians/shifts`

Acciones:
1. Consultar registros de inicio/salida por técnico.
2. Revisar horas trabajadas y horas extra.
3. Exportar reporte en Excel con el botón `Exportar Excel`.

#### Espacio para visuales (Word) - 4.7 Turnos técnicos
- **Figura 4.7-A (obligatoria)**
  Ubicación en Word: inmediatamente después de este bloque.
  Captura sugerida: vista de turnos con registros por técnico.
  Pie sugerido: `Figura 4.7-A. Consulta de turnos técnicos por Backoffice.`
  `[PEGAR CAPTURA AQUÍ]`

- **Figura 4.7-B (opcional)**
  Ubicación en Word: debajo de la Figura 4.7-A.
  Captura sugerida: acción de exportación (`Exportar Excel`) y archivo generado.
  Pie sugerido: `Figura 4.7-B. Exportación de turnos a Excel.`
  `[PEGAR CAPTURA AQUÍ]`

## 5. Reglas de operación para Capital
- El equipo Backoffice Capital puede **consultar** turnos técnicos y exportarlos.
- El inicio/cierre de turno lo realiza cada técnico en su flujo.
- La asignación técnica la realiza rol autorizado (Planner/Admin).
- Si un caso requiere intervención técnica, Backoffice hace seguimiento del estado y evidencia.
- STS solo aparece si el usuario tiene capacidades activas (`STS_READ`, `STS_WRITE` o `STS_ADMIN`).

## 6. Checklist de entrega (Go-Live)
1. Usuario puede iniciar sesión.
2. Usuario ve menú: `Casos`, `Buses`, `Videos`, `Turnos`, `Perfil` (y `STS` si aplica).
3. Usuario abre `Turnos` y consulta registros correctamente.
4. Usuario crea caso y lo consulta en bandeja.
5. Usuario abre detalle de caso y visualiza trazabilidad.
6. Usuario entra a gestión de videos y abre detalle de solicitud.
7. Usuario consulta hoja de vida de bus.
8. Si tiene STS habilitado: abre `/sts`, consulta `/sts/tickets` y `/sts/reports`.

## 7. Incidencias comunes
- **No autorizado**: validar rol del usuario y tenant.
- **No veo un módulo**: confirmar permisos/capabilities.
- **No veo Turnos**: validar rol `BACKOFFICE` o `ADMIN`.
- **No puedo validar OT**: revisar estado del caso/OT y permisos del usuario.
- **No veo STS**: validar capacidades del usuario (`STS_READ`, `STS_WRITE`, `STS_ADMIN`).

## 8. Contacto de soporte
Registrar incidencias con:
- URL de la pantalla
- Usuario afectado
- Hora del evento
- Captura de pantalla y mensaje de error
