# Monitor del servidor (alertas automáticas)

Vigila el servidor y avisa por Telegram **antes** de que algo se caiga. Nació del incidente del 5 de septiembre de 2026, en el que el disco C: se llenó, PostgreSQL se apagó solo y la plataforma estuvo caída cuatro horas sin que nadie se enterara hasta que los usuarios reportaron.

## Qué vigila, cada 15 minutos

| Chequeo | Umbral | Aviso |
|---|---|---|
| Espacio libre en **C:** | menos de 60 GB | "quedan X GB libres, ampliar el disco" |
| Espacio libre en **D:** | menos de 100 GB | igual |
| **Base de datos** responde en el puerto 5433 | — | "la base de datos NO responde" |
| **Aplicación** responde en `localhost:3000` | — | "la aplicación no responde" |

Cuando la condición se normaliza envía un aviso de recuperación, así uno sabe que ya pasó sin tener que entrar al servidor.

**No depende de la app ni de la base.** Es un script de PowerShell independiente que corre como tarea programada de Windows; funciona justamente cuando todo lo demás está caído, que es cuando hace falta.

**No satura.** Mientras el problema siga vigente, repite el aviso máximo cada 6 horas (`$horasEntreAvisos`).

## Instalación (una sola vez, en el servidor)

PowerShell **como administrador**:

```powershell
cd "D:\apps\capital-desk"
git fetch origin
git reset --hard origin/main
```

Prueba manual (no requiere reiniciar ni compilar nada):

```powershell
powershell -ExecutionPolicy Bypass -File D:\apps\capital-desk\scripts\monitor-servidor.ps1
```

Revisar que haya escrito el log:

```powershell
Get-Content D:\apps\capital-desk\logs\monitor_*.log -Tail 10
```

Registrar la tarea programada:

```powershell
schtasks /Create /TN "CapitalDesk-Monitor" /TR "powershell -ExecutionPolicy Bypass -File D:\apps\capital-desk\scripts\monitor-servidor.ps1" /SC MINUTE /MO 15 /RU SYSTEM /F
```

Verificar que quedó:

```powershell
schtasks /Query /TN "CapitalDesk-Monitor"
```

## Configuración

Los umbrales están al principio de `scripts/monitor-servidor.ps1`:

```powershell
$umbralGB = @{ "C" = 60; "D" = 100 }
$horasEntreAvisos = 6
$puertoPostgres = 5433
$urlApp = "http://localhost:3000/login"
```

Usa `TELEGRAM_BOT_TOKEN` y `TELEGRAM_GROUP_CHAT_ID` del `.env` del servidor (los mismos del grupo de novedades). Si faltan, el script no falla: solo deja anotado en el log que no pudo avisar.

## Archivos que genera

- `logs/monitor_AAAA-MM-DD.log` — cada chequeo con su resultado.
- `logs/monitor-estado.json` — memoria de qué avisos ya se enviaron, para no repetirlos.

## Probar que la alerta llega de verdad

Bajar temporalmente el umbral de C: a un valor por encima del espacio libre actual (por ejemplo 900), correr el script a mano y confirmar que llega el mensaje al grupo. Después devolver el umbral a 60.
