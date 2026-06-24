# Importar evidencias de preventivo (junio 2026)

Carga las fotos de cada bus a la tarjeta **"Evidencias y adjuntos"** del caso
correspondiente, dejando la **fecha de la evidencia igual a la fecha de cierre**
del caso. Autor: **Anderson Rueda**.

- 49 casos con fotos · 647 imágenes · 9 casos sin carpeta (se reportan y se omiten):
  K1410, K1441, K1452, K1474, K1492, K1530, K1630, K1631, K1657.
- Es **idempotente**: si lo corres dos veces, NO duplica.

---

## Pasos en el SERVIDOR (PowerShell, en `D:\apps\capital-desk`)

Ejecuta los comandos **uno por uno**.

### 1) Traer el código nuevo (script + comando npm)
```powershell
cd D:\apps\capital-desk
```
```powershell
git fetch
```
```powershell
git reset --hard origin/main
```
> No hace falta detener pm2 ni hacer build: esto NO cambia la app, solo carga datos.

### 2) Dejar las fotos en el servidor
Copia el archivo **`6.Junio.zip`** a `D:\apps\capital-desk\evidencias\` y descomprímelo:
```powershell
Expand-Archive -Path "D:\apps\capital-desk\evidencias\6.Junio.zip" -DestinationPath "D:\apps\capital-desk\evidencias" -Force
```
Debe quedar así: `D:\apps\capital-desk\evidencias\6.Junio\K1407\...`, `...\K1422\...`, etc.

### 3) PRUEBA (no toca nada, solo muestra qué haría)
```powershell
npm run import:evidencias
```
Revisa el reporte: casos a procesar, fotos por caso, y la lista de los 9 sin carpeta.

### 4) APLICAR (ahora sí carga las evidencias)
```powershell
npm run import:evidencias -- --apply
```

Listo. Entra a cualquiera de los casos en la web y verás las fotos en
**"Evidencias y adjuntos"** con la fecha de cierre del caso.

---

## Opciones (por si acaso)

- Si pusiste la carpeta en otra ruta:
  ```powershell
  npm run import:evidencias -- --apply --dir "D:\ruta\a\6.Junio"
  ```
- Otro autor (por correo):
  ```powershell
  npm run import:evidencias -- --apply --sender "otro.correo@upk.local"
  ```

## Si algo sale mal
- **"No existe la carpeta de evidencias"**: revisa que exista `D:\apps\capital-desk\evidencias\6.Junio` con las subcarpetas `K####`, o usa `--dir`.
- **"No se encontró el usuario autor"**: confirma el correo de Anderson con `--sender`.
- **Error de `DATABASE_URL`**: corre el comando parado en `D:\apps\capital-desk` (igual que tus otros `npm run import:*`).
