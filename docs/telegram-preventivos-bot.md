# Bot de Telegram — preventivos + aviso de cierre

Dos cosas:

1. **Bot de consulta:** le escribes el código de un bus y responde su **último
   mantenimiento preventivo** (fecha, OT, técnico, estado) y si tuvo novedades
   (correctivos generados + observaciones del reporte).
2. **Aviso a un grupo:** cuando un preventivo se **cierra** (se ejecuta), llega
   un mensaje a un grupo de Telegram con el resumen.

---

## Qué se agregó

- `src/app/api/integrations/preventivo-last/route.ts` — consulta el último preventivo.
- `scripts/telegram-preventivos-bot.ts` — el bot de consulta.
- `src/lib/telegram-notify.ts` — aviso al grupo al cerrar (función `notifyPreventivoClosed`), enganchado en el cierre/validación de OT.
- `ecosystem.config.cjs` — app `preventivos-bot`. `package.json` — `npm run bot:preventivos`.

---

## Paso 1 — Crear el bot

En **@BotFather**: `/newbot` → nombre (ej. `Preventivos CapitalBus`) y usuario que
termine en `bot` (ej. `capitalbus_preventivos_bot`). Copia el **token**.

## Paso 2 — Variables (.env del servidor)

```
TELEGRAM_PREVENTIVOS_BOT_TOKEN=PEGA_AQUI_EL_TOKEN
PREVENTIVO_QUERY_URL=http://localhost:3000/api/integrations/preventivo-last
```

`NOVEDADES_INTAKE_SECRET` ya está. (El de abajo, `TELEGRAM_PREVENTIVOS_GROUP_CHAT_ID`,
se agrega en el Paso 5.)

## Paso 3 — Desplegar

```powershell
git fetch; git reset --hard origin/main
```
```powershell
pm2 stop capitaldesk; npm run build; pm2 restart capitaldesk
```
```powershell
pm2 start ecosystem.config.cjs --only preventivos-bot
```
```powershell
pm2 save
```

(Se hace `npm run build` porque se agregó un endpoint y los avisos de cierre.)

## Paso 4 — Probar la consulta

Abre el bot (`@capitalbus_preventivos_bot`), `/start`, y manda un código (ej. `K1402`).

## Paso 5 — Grupo de avisos de cierre

1. Crea un grupo (ej. **Preventivos CapitalBus**) y agrega al bot
   **@capitalbus_novedades_bot** (el aviso lo envía ese bot, que es el que tiene el token del servidor).
2. En el grupo escribe `/id` → copia el número (negativo).
3. En el `.env` agrega:
   ```
   TELEGRAM_PREVENTIVOS_GROUP_CHAT_ID=-100...
   ```
4. Reinicia la app para que tome la variable:
   ```powershell
   pm2 restart capitaldesk
   ```

Desde ahí, cada vez que se cierre un preventivo, llega el resumen (bus, fecha,
OT, técnico, observaciones y correctivos generados) a ese grupo.

> Nota: el aviso de cierre lo manda la **app** usando `TELEGRAM_BOT_TOKEN` (el del
> bot de novedades). Por eso al grupo de preventivos hay que agregar ese bot
> (@capitalbus_novedades_bot), no el de consulta.

---

## Mantenimiento

```powershell
pm2 logs preventivos-bot
pm2 restart preventivos-bot
```
