# Monitor del servidor Capital Desk
# Vigila espacio en disco, la base de datos y la aplicacion, y avisa por Telegram.
# Corre por su cuenta: NO depende de que la app ni la base esten arriba.
#
# Registrar una sola vez (PowerShell como administrador):
#   schtasks /Create /TN "CapitalDesk-Monitor" /TR "powershell -ExecutionPolicy Bypass -File D:\apps\capital-desk\scripts\monitor-servidor.ps1" /SC MINUTE /MO 15 /RU SYSTEM /F
#
# Probar a mano:
#   powershell -ExecutionPolicy Bypass -File D:\apps\capital-desk\scripts\monitor-servidor.ps1

$ErrorActionPreference = "Stop"

# ----------------- Configuracion -----------------
$umbralGB = @{ "C" = 60; "D" = 100 }   # avisa cuando el disco libre baje de esto
$horasEntreAvisos = 6                  # no repetir el mismo aviso antes de N horas
$puertoPostgres = 5433
$urlApp = "http://localhost:3000/login"
# -------------------------------------------------

$projectDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("monitor_" + (Get-Date -Format "yyyy-MM-dd") + ".log")
$estadoFile = Join-Path $logDir "monitor-estado.json"

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line
}

function LeerEnv($clave) {
  $envFile = Join-Path $projectDir ".env"
  if (-not (Test-Path $envFile)) { return "" }
  $l = Select-String -Path $envFile -Pattern ("^" + $clave + "=") | Select-Object -First 1
  if (-not $l) { return "" }
  return ($l.Line -replace ("^" + $clave + "="), "").Trim().Trim('"').Trim("'")
}

$token = LeerEnv "TELEGRAM_BOT_TOKEN"
$chat  = LeerEnv "TELEGRAM_GROUP_CHAT_ID"

function EnviarTelegram($texto) {
  if ((-not $token) -or (-not $chat)) { Log "Sin TELEGRAM_BOT_TOKEN o TELEGRAM_GROUP_CHAT_ID en .env: no se envia aviso"; return }
  try {
    $uri = "https://api.telegram.org/bot" + $token + "/sendMessage"
    $body = @{ chat_id = $chat; text = $texto }
    Invoke-RestMethod -Method Post -Uri $uri -Body $body -TimeoutSec 20 | Out-Null
    Log ("Aviso enviado: " + $texto)
  } catch {
    Log ("ERROR enviando a Telegram: " + $_)
  }
}

$estado = $null
if (Test-Path $estadoFile) {
  try { $estado = Get-Content $estadoFile -Raw | ConvertFrom-Json } catch { $estado = $null }
}
function EstadoAnterior($k) {
  if ($estado -and ($estado.PSObject.Properties.Name -contains $k)) { return $estado.$k }
  return $null
}

$nuevoEstado = @{}

function Reportar($clave, $hayProblema, $textoProblema, $textoOk) {
  $anterior = EstadoAnterior $clave
  if ($hayProblema) {
    $ultimo = $null
    if ($anterior) { try { $ultimo = [datetime]$anterior } catch { $ultimo = $null } }
    if ((-not $ultimo) -or (((Get-Date) - $ultimo).TotalHours -ge $horasEntreAvisos)) {
      EnviarTelegram $textoProblema
      $script:nuevoEstado[$clave] = (Get-Date).ToString("o")
    } else {
      $script:nuevoEstado[$clave] = $anterior
      Log ("Problema vigente pero ya avisado hace poco: " + $clave)
    }
  } else {
    if ($anterior) { EnviarTelegram $textoOk }
  }
}

Log "== Chequeo del servidor =="

# 1) Discos
foreach ($letra in @("C","D")) {
  $d = Get-PSDrive $letra -ErrorAction SilentlyContinue
  if (-not $d) { continue }
  $libreGB = [math]::Round($d.Free/1GB, 1)
  $limite = $umbralGB[$letra]
  Log ("Disco " + $letra + ": " + $libreGB + " GB libres (umbral " + $limite + " GB)")
  $problema = ($libreGB -lt $limite)
  $msgMal = "ALERTA Capital Desk - Disco " + $letra + ": quedan " + $libreGB + " GB libres (umbral " + $limite + " GB). Ampliar el disco en Cloud Director de ETB antes de que se llene. Si el disco llega a cero, la base de datos se apaga y la plataforma se cae."
  $msgBien = "OK Capital Desk - Disco " + $letra + " normalizado: " + $libreGB + " GB libres."
  Reportar ("disco_" + $letra) $problema $msgMal $msgBien
}

# 2) Base de datos
$dbOk = $false
try {
  $t = Test-NetConnection -ComputerName "127.0.0.1" -Port $puertoPostgres -InformationLevel Quiet -WarningAction SilentlyContinue
  $dbOk = [bool]$t
} catch { $dbOk = $false }
Log ("Base de datos (puerto " + $puertoPostgres + "): " + $dbOk)
Reportar "db" (-not $dbOk) ("ALERTA Capital Desk - La base de datos NO responde en el puerto " + $puertoPostgres + ". Revisar el servicio postgresql-x64-16 y el espacio en disco.") "OK Capital Desk - La base de datos volvio a responder."

# 3) Aplicacion
$appOk = $false
try {
  $r = Invoke-WebRequest -Uri $urlApp -UseBasicParsing -TimeoutSec 20
  $appOk = (($r.StatusCode -ge 200) -and ($r.StatusCode -lt 400))
} catch { $appOk = $false }
Log ("Aplicacion (" + $urlApp + "): " + $appOk)
Reportar "app" (-not $appOk) "ALERTA Capital Desk - La aplicacion no responde en el servidor. Revisar pm2 (pm2 list) y la base de datos." "OK Capital Desk - La aplicacion volvio a responder."

($nuevoEstado | ConvertTo-Json) | Set-Content -Path $estadoFile -Encoding UTF8
Log "== Fin del chequeo =="
