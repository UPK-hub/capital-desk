# Mantenimiento automático de telemetría (Capital Desk)
# - Todos los días: recalcula el rollup diario (ayer + hoy).
# - La purga automática de videos está DESACTIVADA (ver $purgaVideosActiva).
# - Los domingos: purga tramas viejas (respaldadas antes de borrar).
#
# Programar con el Programador de tareas de Windows (una sola vez, PowerShell como admin):
#   schtasks /Create /TN "CapitalDesk-Mantenimiento" /TR "powershell -ExecutionPolicy Bypass -File C:\ruta\al\proyecto\scripts\mantenimiento-telemetria.ps1" /SC DAILY /ST 02:30 /RU SYSTEM
# (cambiar C:\ruta\al\proyecto por la carpeta real del proyecto)

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

$logDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("mantenimiento_" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  $line | Tee-Object -FilePath $log -Append
}

Log "== Inicio mantenimiento de telemetría =="

Log "Rollup diario..."
npm run rollup:daily 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -ne 0) { Log "ERROR: rollup diario falló (código $LASTEXITCODE)" }

# Recordatorio de casos RESUELTO sin validar (3+ días) al grupo de Telegram.
# Requiere que la app esté corriendo (pm2) y CRON_SECRET definido en .env.
try {
  $envFile = Join-Path $projectDir ".env"
  $cronSecret = ""
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern '^CRON_SECRET=' | Select-Object -First 1
    if ($line) { $cronSecret = $line.Line -replace '^CRON_SECRET=', '' -replace '"', '' }
  }
  if ($cronSecret) {
    Log "Recordatorio de casos RESUELTO sin validar..."
    Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/cron/recordatorio-resueltos" -Headers @{ "x-cron-secret" = $cronSecret } | Out-String | Tee-Object -FilePath $log -Append
  } else {
    Log "CRON_SECRET no encontrado en .env: se omite el recordatorio."
  }
} catch {
  Log "ERROR: recordatorio de resueltos falló: $_"
}

# Retención de videos: borra los videos de descargas con más de N días.
# Solo toca adjuntos de tipo Video; actas, casos e histórico quedan intactos.
#
# DESACTIVADA (21/08/2026, decisión de Valeria): el borrado automático NO corre.
# Para activarla, poner $purgaVideosActiva = $true y ajustar los días.
# Mientras esté en $false, la purga solo se puede hacer a mano:
#   npm run videos:purgar -- --dias 45            (simulación, no borra)
#   npm run videos:purgar -- --dias 45 --apply    (borra de verdad)
$purgaVideosActiva = $false
$retencionVideosDias = 45
if ($purgaVideosActiva) {
  Log "Purga de videos con más de $retencionVideosDias días..."
  npm run videos:purgar -- --dias $retencionVideosDias --apply --huerfanos --avisar 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { Log "ERROR: purga de videos falló (código $LASTEXITCODE)" }
} else {
  Log "Purga de videos DESACTIVADA (purgaVideosActiva = false): no se borra nada."
}

# Purga semanal de tramas (solo domingos). El script respalda a .ndjson.gz
# ANTES de borrar; si el respaldo no cuadra, no borra nada.
if ((Get-Date).DayOfWeek -eq "Sunday") {
  Log "Domingo: purga de tramas viejas (con respaldo)..."
  npm run tramas:purge 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { Log "ERROR: purga de tramas falló (código $LASTEXITCODE)" }
}

Log "== Fin mantenimiento =="
