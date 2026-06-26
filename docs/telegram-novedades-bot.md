# Bot de Telegram para reportar novedades

Permite que un cliente le escriba a un bot de Telegram, responda unas preguntas
(código de bus, equipo afectado, **falla del catálogo** —con su código NVD-xxx—,
detalle, nombre, teléfono y una foto opcional) y la novedad quede registrada
**automáticamente** en el apartado **Novedades** de la mesa, en estado **NUEVO**,
para que el equipo la revise.

La novedad se **asocia al usuario de la mesa** cuyo nombre coincida (queda como
creador del caso); si ninguno coincide, se registra igual con una alerta. El bus
se acepta **con o sin la "K"** (1402 = K1402). Y cada novedad puede publicarse en
un **grupo de Telegram** (ver más abajo).

> El bot **solo crea la novedad**. No genera correctivo ni OT automáticamente:
> eso lo decide tu equipo desde la mesa, como hasta ahora.

---

## Qué se agregó al proyecto

- `src/app/api/integrations/novedades/route.ts` — recibe la novedad y crea el caso.
- `scripts/telegram-novedades-bot.ts` — el bot que conversa con el cliente.
- `ecosystem.config.cjs` — se añadió la app `novedades-bot` para pm2.
- `package.json` — se añadió el comando `npm run bot:novedades`.

No se modificó nada del flujo actual de la mesa.

---

## Paso 1 — Crear el bot en Telegram (5 minutos)

1. En Telegram, busca **@BotFather** y ábrelo.
2. Envía `/newbot`.
3. Te pedirá un **nombre** (ej. `Novedades CapitalBus`) y un **usuario** que
   debe terminar en `bot` (ej. `capitalbus_novedades_bot`).
4. BotFather te dará un **token** parecido a:
   `7712345678:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
5. **Guarda ese token**, lo usarás en el Paso 2.

---

## Paso 2 — Configurar las variables (en el servidor)

En el servidor, en la carpeta `D:\apps\capital-desk`, abre (o crea) el archivo
**`.env`** y agrega estas líneas al final:

```
# --- Bot de novedades por Telegram ---
TELEGRAM_BOT_TOKEN=PEGA_AQUI_EL_TOKEN_DE_BOTFATHER
NOVEDADES_INTAKE_URL=http://localhost:3000/api/integrations/novedades
NOVEDADES_INTAKE_SECRET=8b0e1afc7a7d6bc18195ca8bd3f0c76460165362d80c8584
```

Notas:

- `NOVEDADES_INTAKE_SECRET` es una contraseña interna que protege el endpoint.
  Ya te dejé una lista para usar arriba; si prefieres, puedes cambiarla por
  cualquier texto largo. **El mismo valor debe quedar en este `.env`** (lo leen
  tanto la app como el bot).
- Si tu empresa no es el tenant `CAPITALBUS`, agrega también:
  `NOVEDADES_TENANT_CODE=TU_CODIGO`
- Opcional: para que también llegue correo a Supervisor/Planeador por cada
  novedad, agrega `NOVEDADES_NOTIFY_EMAIL=true` (por defecto solo notifica
  dentro de la app).
- Opcional (recomendado): `TELEGRAM_GROUP_CHAT_ID=...` para que cada novedad caiga
  en un grupo de Telegram con su resumen. Cómo obtener ese id se explica en la
  sección **"Grupo de avisos"** más abajo (se agrega después).

---

## Paso 3 — Desplegar el código nuevo

Primero sube los cambios a GitHub (desde donde trabajas el proyecto) y luego, en
el servidor con **PowerShell como administrador**, parado en `D:\apps\capital-desk`,
ejecuta los comandos **uno por uno**:

```powershell
git fetch
```
```powershell
git reset --hard origin/main
```
```powershell
pm2 stop capitaldesk
```
```powershell
npm run build
```
```powershell
pm2 restart capitaldesk
```

> Se detiene la app antes del `build` para evitar el error de permisos de Prisma,
> tal como en tus despliegues normales.

---

## Paso 4 — Encender el bot

Con la app ya corriendo, arranca el bot (también en PowerShell, en la misma carpeta):

```powershell
pm2 start ecosystem.config.cjs --only novedades-bot
```
```powershell
pm2 save
```

Para confirmar que quedó arriba:

```powershell
pm2 status
```

Deberías ver `novedades-bot` en estado **online**.

---

## Grupo de avisos (resumen de cada novedad)

Para que el equipo no tenga que leer todo el chat, el bot puede publicar un
**resumen** de cada novedad (bus, falla + código, quién reporta, usuario asociado
o alerta, y el número de caso) en un **grupo de Telegram**.

1. En Telegram, crea un **grupo** (ej. "Novedades CapitalBus") y agrega como
   miembro a tu bot **@capitalbus_novedades_bot**.
2. Dentro del grupo, escribe `/id`. El bot responderá con algo como
   `🆔 Chat ID: -1001234567890` (los grupos tienen id **negativo**).
3. Copia ese número y agrégalo al `.env` del servidor:
   ```
   TELEGRAM_GROUP_CHAT_ID=-1001234567890
   ```
4. Reinicia solo el bot para que tome el cambio:
   ```powershell
   pm2 restart novedades-bot
   ```

Desde ese momento, cada novedad registrada llega también al grupo. Si no
configuras esta variable, el bot funciona igual pero sin publicar en el grupo.

> Si el bot no responde `/id` dentro del grupo, en BotFather usa
> `/setprivacy` → elige tu bot → **Disable**, para que pueda leer los mensajes
> del grupo. Luego vuelve a intentar `/id`.

---

## Paso 5 — Probar

1. En Telegram, abre tu bot (busca el usuario que creaste, ej. `@capitalbus_novedades_bot`).
2. Envía `/start`.
3. Responde: código del bus → equipo afectado (botones) → descripción → nombre →
   teléfono → foto (o escribe `omitir`).
4. El bot responde: **"✅ Tu novedad quedó registrada como CASO-00XX"**.
5. Entra a la mesa, sección **Novedades**: el caso debe aparecer en estado NUEVO,
   con la foto y los datos de quien reportó.

Si escribes un bus que no existe, el bot avisa y te pide intentar de nuevo.

---

## Comandos útiles (mantenimiento)

Ver lo que está haciendo el bot (logs en vivo):
```powershell
pm2 logs novedades-bot
```

Reiniciar el bot (por ejemplo, después de cambiar el `.env`):
```powershell
pm2 restart novedades-bot
```

Apagar el bot:
```powershell
pm2 stop novedades-bot
```

---

## Cosas a tener en cuenta

- **Quién puede usarlo:** cualquiera que tenga el enlace del bot puede reportar
  (así lo definimos). Si más adelante quieres limitarlo a teléfonos autorizados o
  a un grupo, se puede agregar.
- **Seguridad:** el endpoint solo acepta solicitudes con el `NOVEDADES_INTAKE_SECRET`
  correcto, así que nadie externo puede crear casos sin el bot.
- **Si el bot se reinicia** a mitad de una conversación, el cliente solo tiene que
  enviar `/start` otra vez.
- El bot **no necesita** que se vuelva a compilar el proyecto cuando se cambian
  sus textos: corre con `tsx`. Pero si cambia el endpoint de la app (`route.ts`),
  sí hay que repetir el `npm run build` del Paso 3.
```
