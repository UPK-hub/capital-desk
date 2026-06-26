# Bot de Telegram — consulta de tramas (P20 / P60)

Un bot **aparte** del de novedades. Le escribes el **código de un bus** y te
responde la **última trama P20 y P60** que registró, con la fecha/hora y hace
cuánto (sirve para ver si un bus dejó de reportar). Es de **solo lectura**.

Ejemplo:

```
Tú: K1402
Bot: 🚌 Bus K1402 (GUW522)

     📡 Última P20: 26/06/2026 02:14 p. m. (hace 8 min)
     📡 Última P60: 26/06/2026 02:05 p. m. (hace 17 min)
```

Funciona con o sin la "K" (`1402` = `K1402`).

---

## Qué se agregó al proyecto

- `src/app/api/integrations/tramas-last/route.ts` — consulta la última P20/P60 de un bus.
- `scripts/telegram-tramas-bot.ts` — el bot de consulta.
- `ecosystem.config.cjs` — app `tramas-bot` para pm2.
- `package.json` — comando `npm run bot:tramas`.

---

## Paso 1 — Crear el bot en Telegram

1. Abre **@BotFather** y envía `/newbot`.
2. Nombre (ej. `Consulta Tramas CapitalBus`) y usuario que termine en `bot`
   (ej. `capitalbus_tramas_bot`).
3. Copia el **token** que te da.

---

## Paso 2 — Configurar las variables (servidor)

En `D:\apps\capital-desk`, abre el `.env` (`notepad .env`) y agrega al final:

```
TELEGRAM_TRAMAS_BOT_TOKEN=PEGA_AQUI_EL_TOKEN_DEL_NUEVO_BOT
TRAMAS_QUERY_URL=http://localhost:3000/api/integrations/tramas-last
```

`NOVEDADES_INTAKE_SECRET` ya está en tu `.env` (se reutiliza). No hace falta nada más.

---

## Paso 3 — Desplegar

Sube el código (desde tu Mac) y en el servidor (PowerShell admin, en `D:\apps\capital-desk`):

```powershell
git fetch; git reset --hard origin/main
```
```powershell
pm2 stop capitaldesk; npm run build; pm2 restart capitaldesk
```
```powershell
pm2 start ecosystem.config.cjs --only tramas-bot
```
```powershell
pm2 save
```

> Se hace `npm run build` porque se agregó un endpoint nuevo a la app.

Confirma que esté arriba:
```powershell
pm2 status
```
Debes ver **`tramas-bot`** en estado **online** (además de `capitaldesk` y `novedades-bot`).

---

## Paso 4 — Probar

1. Abre tu nuevo bot en Telegram (`@capitalbus_tramas_bot`).
2. Envía `/start` y luego un **código de bus** (ej. `K1402`).
3. Te responde la última P20 y P60.

---

## Mantenimiento

```powershell
pm2 logs tramas-bot      # ver actividad
pm2 restart tramas-bot   # reiniciar
pm2 stop tramas-bot      # apagar
```

Si un bus no tiene registros de P20 o P60, el bot lo dice ("sin registros").
