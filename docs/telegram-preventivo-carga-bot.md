# Bot de Telegram — CARGA de preventivos

Bot para que los técnicos armen el preventivo del mes desde el celular: mandan el
código del bus, suben las evidencias una a una con botones, registran voltajes,
checks y hallazgos, y marcan **inicio/fin**. El "fin" lo puede mandar **otro
técnico**: quedan registrados el *técnico que abrió* y el *técnico que cerró*, se
cierra el caso y se **genera el certificado** automáticamente.

Es distinto al bot de *consulta* de preventivos (ese solo lee el último). Este
**escribe**: habla con `POST /api/integrations/preventivo-bot`.

## Cómo lo usa el técnico

1. **Registro (una sola vez):** `/registrar tu-correo@dominio.com`
   El bot vincula ese chat de Telegram con el usuario de Capital Desk (por correo).
2. **Mandar el bus:** escribe el código (ej. `K1416` o `1416`).
   Si no hay preventivo abierto ese mes, el bot lo crea; si ya hay uno, lo retoma
   (otro técnico puede continuar donde quedó — verá qué evidencias faltan).
3. **Botones:**
   - 📸 **Evidencias** → toca una (Inicio, Fin, Discos, Período de grabación, VMS…)
     y envía la foto. Se marca ✅ y siguen las pendientes.
   - ⚡ **Voltajes** → toca uno y escribe el valor (ej. 13.8).
   - ✅ **Checklist** → elige sección; cada ítem cicla OK → Hallazgo → N/A.
   - ⚠️ **Hallazgo** → severidad + "equipo — descripción".
   - 📅 **Días de grabación** → escribe el número.
   - 🕐 **Marcar inicio** (hora automática) / 🏁 **Fin / cerrar** (cierra + certificado).

## Variables de entorno (.env)

    TELEGRAM_PREVENTIVO_CARGA_TOKEN=  # token del NUEVO bot (BotFather)
    PREVENTIVO_BOT_URL=http://localhost:3000/api/integrations/preventivo-bot
    NOVEDADES_INTAKE_SECRET=          # el MISMO secreto que ya usan los otros bots
    NOVEDADES_TENANT_CODE=CAPITALBUS  # opcional

Crear el bot: en Telegram, habla con **@BotFather** → `/newbot` → copia el token.

## Probar la lógica sin Telegram

    BOT_SELFTEST=1 npx tsx scripts/telegram-preventivo-carga-bot.ts

## Despliegue

Esta entrega **agrega campos a la base de datos** (registro de Telegram del
técnico y técnico apertura/cierre), así que hay que correr la migración.

**1) Subir cambios (desde tu equipo):**

    git add -A
    git commit -m "Bot de carga de preventivos + técnico apertura/cierre"
    git push

**2) En el servidor (PowerShell admin), en `D:/apps/capital-desk`:**

    git fetch --all
    git reset --hard origin/main

    pm2 stop capitaldesk
    npx prisma migrate deploy      # crea los campos nuevos
    npm run build
    pm2 restart capitaldesk

    # Agregar el token del bot al .env y arrancar el proceso nuevo:
    pm2 start ecosystem.config.cjs --only preventivo-carga-bot
    pm2 save

> Recuerda detener la app antes del build (EPERM de Prisma). El certificado y el
> resto del checklist funcionan igual desde el panel web.

## Notas

- El registro por correo asocia el chat a un usuario existente y activo de Capital
  Desk. Si el técnico no está en el sistema, el administrador debe crearlo primero.
- El bot mantiene el estado en memoria; si se reinicia, el técnico vuelve a mandar
  el código del bus (no se pierde nada cargado, solo el "contexto" del chat).
- Archivos: `scripts/telegram-preventivo-carga-bot.ts` (bot) y
  `src/app/api/integrations/preventivo-bot/route.ts` (backend).
