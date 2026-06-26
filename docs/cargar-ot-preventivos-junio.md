# Cargar las OT (PDF) a los preventivos de junio 2026

Cada PDF de la carpeta `OTS\6.Junio 2026` (uno por bus, p. ej. `K1401 PREV.pdf`) se
guarda en el slot **"Archivo de la OT"** de la Orden de Trabajo del caso PREVENTIVO
de junio de ese bus. Es lo mismo que subir el PDF a mano en la tarjeta
"Archivo de la OT" de cada caso, pero para todos a la vez.

El script empareja por el código del bus que está en el nombre del archivo, así que
`K1404 PRE` (sin la V) también se reconoce. Si un bus tiene dos PDF (`K1405 PRE` y
`K1405 PREV`), usa el que dice **PREV**. Si un preventivo no tiene OT, la crea sola.

---

## Paso 1 — Subir el script (en tu Mac, carpeta del proyecto)

Abre la Terminal y pega, **una línea a la vez**:

```
cd ~/Documents/Claude/Projects/"DESARROLLO CAPITALBUS MESA"/capital-desk
```
```
git add scripts/import-ot-preventivo.ts package.json
```
```
git commit -m "Script: cargar OT (PDF) a preventivos de junio"
```
```
git push
```

## Paso 2 — Traer el script al servidor (Windows, PowerShell como administrador)

```
cd D:\apps\capital-desk
```
```
git fetch
```
```
git reset --hard origin/main
```

> No hace falta `pm2 stop`, ni `npm run build`, ni reiniciar. Esto **no cambia la
> app**, solo es un script que carga archivos. Las OT en `OTS\6.Junio 2026` no se
> borran con el `reset` (no las toca).

## Paso 3 — PRUEBA primero (no escribe nada)

```
npm run import:ot-preventivo -- --dir "D:\apps\capital-desk\OTS\6.Junio 2026"
```

Lee el reporte. Te dice:

- cuántas OT se van a cargar,
- los **casos de junio sin PDF** (buses que tienen caso pero no PDF),
- los **PDF sin caso de junio** (PDF que no tienen a qué caso ir → revisar),
- los **duplicados** que resolvió (p. ej. K1405),
- los PDF sin código de bus reconocible.

## Paso 4 — APLICAR (ya escribe en el sistema)

Si el reporte se ve bien:

```
npm run import:ot-preventivo -- --dir "D:\apps\capital-desk\OTS\6.Junio 2026" --apply
```

Listo. Abre un par de casos preventivos en la web y revisa que en la tarjeta
**"Archivo de la OT"** aparezca el PDF.

---

## Notas

- **Seguro de repetir:** si lo corres con `--apply` dos veces, **no duplica**. Salta
  las OT que ya tienen archivo.
- **Reemplazar un PDF ya cargado:** agrega `--force` al final.
- **Otro mes:** agrega `--mes 2026-07` (y la carpeta con `--dir`).
- **No crear OT faltantes:** agrega `--no-crear-ot` (entonces solo carga en casos que
  ya tienen OT; los demás salen en el reporte como "sin PDF / sin OT").
