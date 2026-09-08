# Runbook — puesta en marcha del almacenamiento de videos de botón de pánico

Orden de ejecución: CBSTS1 y CBSTS2 (almacenamiento) → CBSTS3 (mesa) →
despliegue de la aplicación → pruebas.

## Parte 1 · CBSTS1 y CBSTS2 (Ubuntu)

Ejecutar lo mismo en las dos máquinas, cambiando solo la IP.

### 1.1 Preparar el disco

```bash
lsblk                      # identificar el disco de datos (ej. /dev/sdb)
sudo mkfs.ext4 -m 0 -L PANIC /dev/sdb
sudo mkdir -p /srv/panic
echo 'LABEL=PANIC /srv/panic ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
sudo mount -a
df -h /srv/panic           # debe mostrar el tamaño completo del disco
```

`-m 0` libera el 5 % que ext4 reserva por defecto para root: sobre 6 TB son
300 GB que se recuperan.

### 1.2 Instalar y configurar Samba

```bash
sudo apt update && sudo apt install -y samba
sudo useradd -M -s /usr/sbin/nologin capitaldesk
sudo smbpasswd -a capitaldesk        # definir contraseña y guardarla en el gestor de claves
sudo smbpasswd -e capitaldesk
sudo chown -R capitaldesk:capitaldesk /srv/panic
sudo chmod 750 /srv/panic
```

Agregar al final de `/etc/samba/smb.conf`:

```ini
[panic]
   path = /srv/panic
   browseable = no
   read only = no
   valid users = capitaldesk
   force user = capitaldesk
   create mask = 0660
   directory mask = 0770
   hosts allow = 10.216.170.0/24
   hosts deny = 0.0.0.0/0
```

```bash
sudo testparm            # valida la sintaxis
sudo systemctl restart smbd
sudo systemctl enable smbd
```

### 1.3 Cortafuegos

```bash
sudo ufw allow from 10.216.170.0/24 to any port 445 proto tcp
sudo ufw status
```

Si el cliente exige restringir a la mesa únicamente, reemplazar la red por la IP
de CBSTS3.

## Parte 2 · CBSTS3 (Windows, PowerShell como administrador)

### 2.1 Acceso a los recursos de red

Capital Desk corre con el usuario **CBSTS3\\Capitalbus** (pm2 en sesión
interactiva, no como servicio de Windows). Basta con guardar las credenciales de
la carpeta compartida en el Administrador de credenciales de ese usuario y usar
las rutas UNC directamente: no hacen falta letras de unidad.

```powershell
cmdkey /add:10.216.170.194 /user:capitaldesk /pass:<contraseña>
cmdkey /add:10.216.170.195 /user:capitaldesk /pass:<contraseña>
cmdkey /list

"prueba" | Out-File \\10.216.170.194\panic\prueba.txt
dir \\10.216.170.194\panic
Remove-Item \\10.216.170.194\panic\prueba.txt
```

**Requisito previo (probado el 2026-09-08):** si la directiva de seguridad local
tiene activa *"Acceso a redes: no permitir el almacenamiento de contraseñas y
credenciales para la autenticación de red"* (`DisableDomainCreds = 1`), `cmdkey`
responde "no se pueden guardar credenciales desde esta sesión de inicio" y
`New-SmbGlobalMapping` falla con el error 1312. Hay que deshabilitar esa
directiva en `secpol.msc` → Directivas locales → Opciones de seguridad, y luego
`gpupdate /force`.

`New-SmbGlobalMapping` sigue fallando con 1312 hasta reiniciar el servidor,
porque esa función lee la directiva al arrancar. No es necesario: con las
credenciales guardadas y rutas UNC el módulo funciona igual.

### 2.2 Variables de entorno de la aplicación

Agregar al `.env` de Capital Desk (junto a las existentes):

```env
# Volúmenes: clave|ruta|GB libres mínimos|capacidad GB, separados por ;
PANIC_STORAGE_VOLUMES=cbsts1|\\10.216.170.194\panic|500|5600;cbsts2|\\10.216.170.195\panic|500|5800

# Secreto que deben enviar los NVR en la cabecera x-integration-secret
PANIC_INTEGRATION_SECRET=<generar uno propio para pánico>

# Cámaras esperadas por evento (la flota tiene 13 cámaras por bus)
PANIC_EXPECTED_CLIPS=13

# Opcionales (valores por defecto entre paréntesis)
# PANIC_CLIP_TARGET_SECONDS=300
# PANIC_CLIP_TOLERANCE_SECONDS=30
# PANIC_MAX_CLIP_BYTES=2147483648
# PANIC_MULTIPART_MAX_BYTES=536870912
# PANIC_RETENTION_YEARS=5
```

`INTEGRATION_DEFAULT_TENANT_CODE=CAPITALBUS` ya está configurado; si no lo
estuviera, agregarlo.

### 2.3 Límite de tamaño en el proxy (si aplica)

Si la mesa se publica detrás de IIS, nginx o un balanceador, ese componente
impone su propio límite de tamaño de petición y rechazaría los clips antes de
que lleguen a la aplicación:

- IIS: `requestFiltering → requestLimits → maxAllowedContentLength` (poner al
  menos 2147483648, en bytes) y `uploadReadAheadSize` si hay ARR.
- nginx: `client_max_body_size 2g;` y `proxy_request_buffering off;` para que el
  archivo no se acumule en el proxy.

Si la aplicación se expone directamente con `next start` / pm2, no hay nada que
ajustar.

## Parte 3 · Despliegue en CBSTS3

En la carpeta del proyecto, PowerShell como administrador:

```powershell
git fetch --all
git reset --hard origin/main

npx prisma migrate deploy      # crea las tablas del módulo de pánico

pm2 stop all                   # detener antes del build (evita el EPERM de Prisma)
npm run build
pm2 restart all
pm2 logs --lines 50
```

Si el build falla con `EPERM` sobre `.prisma\client`: matar los procesos `node`,
borrar `node_modules\.prisma\client` y repetir `npm run build`.

## Parte 4 · Verificación

### 4.1 Estado de los volúmenes

```powershell
npm run panic:almacenamiento
```

Debe listar `CBSTS1` y `CBSTS2` como disponibles con su espacio libre.

**Sobre el espacio libre:** el cliente SMB de Windows no sabe leer el espacio de
un recurso de red mayor a 4 TB — devuelve siempre 4 TiB, tanto por `statfs` como
por el objeto `Scripting.FileSystemObject` (comprobado en CBSTS3 el 2026-09-08).
Por eso el cuarto campo de `PANIC_STORAGE_VOLUMES` declara la capacidad de cada
volumen: cuando el dato del sistema operativo no es confiable, la mesa calcula el
espacio libre como esa capacidad menos los bytes que ella misma ha escrito, y con
eso decide el desbordamiento de CBSTS1 a CBSTS2. El reporte indica de dónde salió
cada cifra (`origen: ...`). Si algún día se copian archivos ajenos a esos
volúmenes, la contabilidad se desvía: son de uso exclusivo del módulo.

### 4.2 Prueba de cargue punta a punta

Desde cualquier equipo del segmento (o desde el propio servidor):

```powershell
curl.exe -X POST "https://<host>/api/integrations/panic-videos?eventid=TEST-001&vehicleid=<bus real>&channel=1&eventtime=2026-09-08T10:00:00-05:00&duration=300" `
  -H "x-integration-secret: <secreto>" `
  -H "x-tenant-code: CAPITALBUS" `
  -H "Content-Type: video/mp4" `
  --data-binary "@C:\ruta\prueba.mp4"
```

Esperado: `201` con `storage: "cbsts1"`. Verificar que el archivo esté en
`\\10.216.170.194\panic\panic-videos\CAPITALBUS\...` y que el evento aparezca en
**Videos → Botón de pánico**.

### 4.3 Prueba de desbordamiento (opcional, recomendada)

Subir temporalmente el umbral del primer volumen por encima de su espacio libre
(por ejemplo `cbsts1|\\10.216.170.194\panic|500|100`), reiniciar la aplicación y repetir el cargue: la
respuesta debe indicar `storage: "cbsts2"`. Devolver el valor original al
terminar.

### 4.4 Permisos

En Administración → Usuarios, habilitar a los usuarios autorizados:

- "Ver botón de pánico" (`PANIC_REVIEW`)
- "Gestionar botón de pánico" (`PANIC_MANAGE`)

Los usuarios sin ninguno de los dos permisos no ven la pestaña ni pueden abrir
los videos.

## Parte 5 · Entrega al proveedor del NVR

Entregar `docs/panic-videos-endpoint.md` junto con:

- URL del endpoint (host público de la mesa).
- Secreto `x-integration-secret` (por canal seguro, no por correo).
- Confirmación de cuántas cámaras se suben por evento (13 o el subconjunto que
  defina la operación).

## Parte 6 · Mantenimiento

| Frecuencia | Acción |
|---|---|
| Semanal | `npm run panic:almacenamiento` — espacio libre y proyección. |
| Semanal | Revisar el filtro "solo incompletos" en la vista y exigir reenvío al proveedor. |
| Mensual | Contrastar el consumo real contra la tabla de dimensionamiento de `docs/panic-videos-arquitectura.md`. Con 13 cámaras por evento este control es crítico: la retención de 5 años solo cabe en 11,92 TB con pocas activaciones diarias. |
| Antes de que CBSTS2 baje del umbral | Solicitar a ETB la ampliación de disco (se hace en caliente desde VMware Cloud Director). |

Nada de este material se borra automáticamente: la retención comprometida es de
5 años.
