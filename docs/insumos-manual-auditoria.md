# Insumos para Manual Nivel Auditoria - Capital Desk

Fecha de corte: 2026-02-19

Este documento separa:
- Lo que ya esta implementado en el sistema.
- Lo que falta definir con contrato/politica para cerrar un manual nivel comite/interventoria/auditoria.

## 1) Objetivo contractual del sistema

### Confirmado en el sistema
- Capital Desk esta descrito como mesa de ayuda y mantenimiento (metadata de app): `src/app/layout.tsx:19`.
- Hay modulo STS (tickets, SLA, KPIs) y modulo TM (reportes/entregables): `README.md:23`, `src/app/page.tsx:86`, `src/app/tm/ui/TmDashboard.tsx:157`.
- Existe exportable TM en Excel: `src/app/api/tm/export/route.ts:67`.

### No encontrado en codigo/documentacion
- No hay referencia explicita a un sistema legado que se este reemplazando.
- No hay referencia explicita a numero/objeto contractual con TM.
- No hay SLA mensual contractual global tipo disponibilidad 99% a nivel plataforma (si hay SLA operativo por ticket STS).

### Dato que debes confirmar externamente
- Sistema anterior reemplazado.
- Marco contractual (numero de contrato, alcance, vigencia, anexos).
- Metas SLA contractuales de servicio global.
- Fuente oficial de reporte (si se declara STS/TM como fuente oficial para comite).

## 2) Matriz real de SLA

### Matriz tecnica actualmente sembrada por defecto
- Emergencia: respuesta 5 min, resolucion 240 min.
- Alta: respuesta 5 min, resolucion 360 min.
- Media: respuesta 15 min, resolucion 1440 min.
- Baja: respuesta 15 min, resolucion 2880 min.
- Fuente: `prisma/seed.ts:592`, `prisma/seed.ts:594`, `prisma/seed.ts:595`, `prisma/seed.ts:596`, `prisma/seed.ts:597`.

### Reglas de calculo implementadas
- Respuesta = `firstResponseAt - openedAt`: `src/lib/sts/sla.ts:79`.
- Resolucion = tiempo efectivo hasta `resolved/closed`, excluyendo estados de pausa y ventanas de mantenimiento: `src/lib/sts/sla.ts:51`, `src/lib/sts/sla.ts:53`.
- Pausa por defecto: `WAITING_VENDOR` (editable por politica): `src/app/api/sts/sla-policies/route.ts:66`.
- Se excluyen ventanas de mantenimiento por componente o globales: `src/app/api/sts/tickets/[id]/route.ts:47`, `src/app/api/sts/tickets/[id]/events/route.ts:58`.
- Breach se calcula automaticamente y se guarda en ticket: `src/app/api/sts/tickets/[id]/route.ts:157`, `src/app/api/sts/tickets/[id]/route.ts:158`.

### Gobernanza de incumplimientos (actual)
- El sistema detecta breach de forma automatica.
- No hay campo/flujo de "aprobacion manual de breach" por un actor de interventoria.
- Si hay trazabilidad de cambios en auditoria STS: `prisma/schema.prisma:489`, `src/app/api/sts/tickets/[id]/route.ts:189`.

### Reporte de brechas
- Filtro por breach en tickets STS: `src/app/api/sts/tickets/route.ts:41`.
- Export CSV/XLSX de tickets con columnas breach: `src/app/api/sts/reports/tickets/route.ts:62`.
- Panel STS de brechas: `src/app/sts/reports/ui/ReportsDashboard.tsx:581`.

## 3) Politica de roles y responsabilidades (RACI operativo actual)

### Matriz operativa observada

| Accion | Backoffice | Tecnico | TM | Administracion |
|---|---|---|---|---|
| Crear caso | Si (UI/rutas backoffice) | No en flujo normal | No | Si |
| Asignar tecnico | No directo, salvo capability `CASE_ASSIGN` | No | No | Si (Admin/Planner) |
| Iniciar OT | No | Si (asignado) | No | Si |
| Finalizar OT | No | Si (asignado) | No | Si |
| Validar OT en validacion (correctivo/preventivo) | Si | No | No | Si |
| Gestionar solicitud de video | Si | Si | No (solo como solicitante externo) | Si |

### Evidencia tecnica de permisos
- Asignacion tecnica: `src/app/api/cases/[id]/assign/route.ts:57`.
- Inicio OT (admin o tecnico asignado): `src/app/api/work-orders/[id]/start/route.ts:37`.
- Finalizacion OT (admin o tecnico asignado): `src/app/api/work-orders/[id]/finish/route.ts:86`.
- Validacion OT (admin/backoffice/supervisor): `src/app/api/work-orders/[id]/validate/route.ts:36`.
- Video (admin/backoffice/tecnico): `src/app/api/video-requests/[id]/route.ts:53`.

### Nota importante para auditoria
- TM no aparece como rol de usuario interno dedicado en schema.
- TM participa como destinatario/solicitante por correo en flujo de video.

## 4) Politica de evidencias

### Reglas implementadas hoy
- Inicio OT: nota obligatoria + foto obligatoria: `src/app/api/work-orders/[id]/start/route.ts:27`.
- Cierre OT: nota obligatoria + minimo 1 evidencia: `src/app/api/work-orders/[id]/finish/route.ts:60`.
- UI inicio acepta `image/*`: `src/app/(tech)/work-orders/[id]/ui/StartWorkOrderCard.tsx:105`.
- UI cierre permite multiples y acepta imagen/documentos: `src/app/(tech)/work-orders/[id]/ui/FinishWorkOrderCard.tsx:203`.
- En preventivo hay evidencias especificas requeridas para completar formulario (VMS, habitaculo, CANBUS, bateria): `src/lib/work-orders/report-completion.ts:36`.

### Lo que NO esta formalizado en backend
- No hay validacion estricta por tipo MIME/extension en `saveUpload` (se guarda lo recibido): `src/lib/uploads.ts:14`.
- No hay politica de retencion/depuracion automatica de archivos en `uploads/`.

### Dato que debes definir externamente
- Minimo de fotos por inicio/cierre por tipo de OT.
- Formatos permitidos oficiales por evidencia.
- Tiempo de conservacion y disposicion final.
- Politica de control de acceso a evidencias para auditoria.

## 5) Flujo exacto de descarga de video

### Flujo real implementado
1. Se crea caso tipo `SOLICITUD_DESCARGA_VIDEO`.
2. Se crea registro `VideoDownloadRequest` en estado `EN_ESPERA` y `PENDIENTE`: `prisma/schema.prisma:1094`.
3. Se envia correo de recibido al solicitante (si hay correos): `src/app/api/cases/route.ts:311`.
4. Backoffice/tecnico gestiona estado en detalle de solicitud: `src/app/api/video-requests/[id]/route.ts:79`.
5. Para adjuntar video, primero la descarga debe estar en `DESCARGA_REALIZADA`: `src/app/api/video-requests/[id]/attachments/route.ts:35`.
6. Al marcar `COMPLETADO`, el sistema exige video adjunto, genera token de descarga (72h) y envia correo con link: `src/app/api/video-requests/[id]/route.ts:205`, `src/app/api/video-requests/[id]/route.ts:209`.
7. Si la descarga falla (`DESCARGA_FALLIDA`), se notifica internamente a admin/backoffice: `src/app/api/video-requests/[id]/route.ts:172`.

### Aclaracion clave
- En el diseno actual, solicitud de video NO genera OT automatica (`requiresWorkOrder: false`): `src/lib/case-type-registry.ts:101`.

### Sobre medio de envio
- El formulario maneja `WINSCP`, `USB`, `ONEDRIVE` como dato: `prisma/schema.prisma:1056`.
- La entrega automatizada implementada hoy es por link temporal de descarga (token), no por integracion automatica WinSCP/OneDrive.

## 6) Politica de notificaciones

### Canales implementados
- Notificaciones web (campana) con polling cada 15s: `src/components/NotificationsBell.tsx:137`.
- Correo automatico para tipos definidos: `src/lib/notifications.ts:24`.
- Chat interno (mensajeria directa): `src/components/FloatingMessenger.tsx:143`, `src/app/api/chat/threads/route.ts:16`.

### Eventos con notificacion efectiva observada
- `CASE_CREATED`, `CASE_ASSIGNED`, `WO_STARTED`, `WO_FINISHED`, `FORM_SAVED`, `VIDEO_REQUEST_CREATED`, `VIDEO_REQUEST_FAILED`, `VIDEO_REQUEST_INTERNAL_DELIVERED`: `src/app/api/cases/route.ts:238`, `src/app/api/cases/[id]/assign/route.ts:315`, `src/app/api/work-orders/[id]/start/route.ts:85`, `src/app/api/work-orders/[id]/finish/route.ts:383`, `src/app/api/video-requests/[id]/route.ts:176`, `src/app/api/video-requests/[id]/route.ts:262`.

### Brecha para manual formal
- Existen tipos `VIDEO_REQUEST_IN_PROGRESS` y `VIDEO_REQUEST_DELIVERED` en enum, pero no se emiten actualmente como notificacion interna: `prisma/schema.prisma:1199`, `prisma/schema.prisma:1200`.
- No todo cambio de estado dispara notificacion automaticamente; depende de que la ruta llame `notifyTenantUsers`.

## 7) Hoja de vida del bus - reglas oficiales

### Lo que hace hoy
- Consolida cronologicamente eventos de bus + caso + pasos OT: `src/app/(backoffice)/buses/[id]/page.tsx:249`, `src/app/(backoffice)/buses/[id]/page.tsx:295`.
- Permite exportar PDF oficial de hoja de vida: `src/app/(backoffice)/buses/[id]/page.tsx:418`, `src/app/api/buses/[id]/life-pdf/route.ts:95`.
- Incluye carpeta de archivos por caso/OT (PDFs, actas, adjuntos): `src/app/(backoffice)/buses/[id]/page.tsx:777`.

### Inmutabilidad
- En STS, la linea de tiempo del ticket se define como inmutable en arquitectura: `docs/sts-architecture.md:48`.
- En hoja de vida bus, el patron operativo es append-only (creacion de eventos), sin flujo de edicion de eventos en UI.

### Edicion de inventario desde hoja de vida
- La vista de hoja de vida del bus es de consulta/exportacion.
- Cambios de inventario se hacen por procesos tecnicos (ej. reportes correctivo/renovacion), no desde una edicion directa en esa vista.

## 8) Branding institucional

### Estado actual de la plataforma
- Marca visible en UI: texto "Capital Desk" + icono generico edificio: `src/components/layout/Sidebar.tsx:141`, `src/components/layout/Sidebar.tsx:134`.
- Tipografias base configuradas: Manrope y Sora: `src/app/layout.tsx:4`.
- Hay modulo de tema para colores/tipografia/radio: `src/app/admin/theme/ui/ThemeAdminClient.tsx:220`, `src/app/api/admin/theme/route.ts:38`.
- No se observan logos institucionales en `public/` (solo assets base): `public/`.

### Dato pendiente para dejarlo "wow" institucional
- Logos oficiales (CapitalBus, UPK, TransMilenio) en version aprobada.
- Paleta corporativa oficial (codigos).
- Tipografia corporativa oficial y reglas de uso.

## 9) Cierre de vacios para comite/interventoria

Para cerrar el manual a nivel auditoria faltan definiciones de gobierno (no de desarrollo):
- Marco contractual formal.
- Dueño oficial de validacion de breaches.
- Politica documental de evidencias y retencion.
- Politica formal de notificacion por estado.
- Definicion institucional de branding.

