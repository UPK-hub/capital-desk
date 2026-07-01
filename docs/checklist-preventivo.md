# Checklist de mantenimiento preventivo (en "Gestionar caso")

El preventivo del panel **Gestionar caso** ya no es el simple "sin novedad / con novedad".
Ahora es un **checklist estructurado por secciones**, y al cerrar el caso se genera un
**certificado PDF** que queda adjunto en el histórico del caso.

## Qué ve el técnico / backoffice

En un caso PREVENTIVO, dentro de la tarjeta "Gestionar caso":

1. **OT del cliente** (obligatoria: adjuntar o marcar pendiente) y **Persona que ejecutó**.
2. **Checklist por secciones** (desplegables):
   - Identificación (kilometraje, hora inicio/fin)
   - Limpieza
   - Eléctrico — 8 voltajes (valor en V + foto opcional por punto)
   - Funcionalidad
   - Centro de gestión
   - Botón de pánico
   - P20 / P60

   Cada ítem se marca **OK / Hallazgo / N/A**; si es Hallazgo, se escribe qué se encontró.
3. **Cierre**: lista de hallazgos por severidad (Crítico / Moderado / Leve) con equipo
   opcional, **¿requiere correctivo?** (si sí, crea el correctivo asociado), recomendaciones
   y observaciones.
4. **Guardar avance** deja todo como borrador (se puede retomar después).
   **Cerrar y generar certificado** cierra el caso, guarda el checklist y adjunta el
   certificado PDF.

El certificado incluye datos del bus, resultado (con/sin novedad), resumen (ítems OK y
hallazgos por severidad), el detalle de cada sección, la tabla de voltajes, los hallazgos,
recomendaciones/observaciones y firmas. Las **fotos** de los voltajes/evidencias quedan
en la sección de evidencias del caso (el PDF solo indica "con foto").

## Cómo cambiar los ítems o secciones del checklist

Todo el contenido del checklist está en **un solo archivo**:

    src/lib/preventive/checklist-template.ts

Ahí se agregan/quitan/renombran secciones e ítems. La UI y el certificado se adaptan solos.
Tipos de ítem: `check` (OK/Hallazgo/N/A), `text` (texto libre) y `voltage` (valor + foto).

> Nota: las secciones e ítems actuales se reconstruyeron de la herramienta HTML. Si algún
> punto no coincide con tu formato real, edítalo en ese archivo (o pídemelo).

## Despliegue (IMPORTANTE — incluye un paso nuevo de base de datos)

Esta entrega **agrega una tabla nueva** (`CasePreventiveChecklist`), así que hay que correr
la migración en el servidor. Es additiva (no toca datos existentes).

**1) Subir los cambios (desde tu equipo):**

    git add -A
    git commit -m "Preventivo: checklist estructurado + certificado PDF"
    git push

**2) En el servidor (PowerShell como administrador), en `D:/apps/capital-desk`:**

    git fetch --all
    git reset --hard origin/main

    pm2 stop capitaldesk

    npx prisma migrate deploy      # <-- PASO NUEVO: crea la tabla del checklist
    npm run build
    pm2 restart capitaldesk

> Recuerda: **detener la app antes del build** (evita el error EPERM de Prisma). Si el build
> falla por EPERM, cierra procesos node, borra `node_modules\.prisma\client` y vuelve a
> `npm run build`.

**Validación:** No se pudo compilar en local (el `node_modules` de esta carpeta está
incompleto), así que **el build del servidor es la primera validación real**. Si `npm run
build` falla, no reinicies: revisa el error o haz rollback.

**Rollback** (si algo sale mal): `git reset --hard <commit_anterior>` + `npm run build` +
`pm2 restart`. La tabla nueva puede quedarse; no afecta al resto.

## Archivos de esta entrega

Nuevos:
- `src/lib/preventive/checklist-template.ts` — plantilla y tipos del checklist.
- `src/lib/preventive/certificate-pdf.ts` — generador del certificado PDF.
- `prisma/migrations/20260630000000_add_case_preventive_checklist/migration.sql`

Modificados:
- `prisma/schema.prisma` — modelo `CasePreventiveChecklist`.
- `src/app/(backoffice)/cases/[id]/ui/GestionCasoCard.tsx` — UI del checklist.
- `src/app/api/cases/[id]/gestion/route.ts` — guardado + certificado.
- `src/app/(backoffice)/cases/[id]/page.tsx` — precarga del borrador.
