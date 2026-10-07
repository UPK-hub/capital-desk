# Mapa base propio (Bogotá, sin proveedores externos)

El mapa de alarmas de Telemetría dibuja su fondo con teselas que sirve Capital Desk
desde un archivo en el disco del servidor. No hay llave de API, no hay cuota mensual
y el tráfico de la mesa no sale a internet para dibujar calles.

Antes se usaban las teselas de CARTO y la capa satelital de Esri. CARTO empezó a
exigir llave de API y fijó un tope para uso comercial, así que se reemplazó por esta
solución. La capa satelital se retiró: la imagen aérea es licenciada y no existe un
equivalente libre autoalojable.

## Cómo funciona

- Los datos son de **OpenStreetMap**, empaquetados por el proyecto **Protomaps** como
  un planeta en formato **PMTiles**: un solo archivo con todas las teselas indexadas
  dentro.
- La herramienta `pmtiles extract` recorta de ese planeta únicamente el recuadro de
  Bogotá, pidiendo por rangos HTTP solo los bytes necesarios. No se descarga el
  planeta completo.
- El archivo queda en `tiles/bogota.pmtiles` dentro del proyecto (o donde apunte
  `MAPA_PMTILES`).
- `src/lib/mapa/pmtiles.ts` lee rangos de ese archivo. `/api/mapa/teselas/{z}/{x}/{y}.mvt`
  entrega la tesela al navegador. `/api/mapa/estado` dice si el archivo está montado.
- En el navegador, `protomaps-leaflet` pinta esas teselas vectoriales sobre el mismo
  Leaflet que ya usaba el mapa, así que la agrupación de alarmas y los popups no
  cambiaron.

## Licencia

Los datos son de OpenStreetMap bajo **ODbL**. La única obligación práctica es dejar
el crédito visible, y ya va en la atribución de la esquina del mapa
(`© OpenStreetMap · teselas propias`). **No quitar esa línea.**

## Instalación en el servidor (CBSTS3)

Una sola vez:

1. Descargar el ejecutable de https://github.com/protomaps/go-pmtiles/releases
   (el archivo de Windows x86_64). Es un único `.exe`, sin instalador.
2. Descomprimirlo y dejar `pmtiles.exe` en `D:\apps\capital-desk\tools\`.
   (La carpeta `tools/` está ignorada por git: el binario no viaja en el repo.)
3. Generar el mapa:

   ```
   cd "D:\apps\capital-desk"
   npm run mapa:generar
   ```

4. Verificar:

   ```
   npm run mapa:verificar
   ```

   Debe imprimir el tamaño, la cobertura y bytes leídos en los puntos de Bogotá.

No hace falta reiniciar la app: el lector detecta el archivo nuevo por fecha y
tamaño en la siguiente petición.

## Variables de entorno (todas opcionales)

| Variable | Por defecto | Para qué |
|---|---|---|
| `MAPA_PMTILES` | `<proyecto>\tiles\bogota.pmtiles` | Dónde vive el archivo. Útil para dejarlo en otro disco. |
| `MAPA_BBOX` | `-74.40,4.30,-73.90,5.00` | Recuadro a recortar: `minLon,minLat,maxLon,maxLat`. |
| `MAPA_PMTILES_BIN` | `tools\pmtiles.exe` | Ruta del ejecutable si está en otro lado. |
| `MAPA_CACHE_SEGUNDOS` | `604800` (una semana) | Cuánto puede guardar el navegador cada tesela. |

El recuadro por defecto cubre Bogotá urbana más la sabana: Soacha, Chía, Cota, Funza,
Mosquera, Madrid y La Calera. Si algún bus opera fuera de ahí, ampliar `MAPA_BBOX` y
volver a generar.

## Dimensionamiento

- Archivo de Bogotá: decenas de MB. Un solo video de descarga pesa más.
- Vive en D:, no en C:. C: está compartido con la base de datos y no tiene holgura
  (ver `capital-desk-postgres-disco-c`).
- El zoom máximo con datos es 15; más allá el renderizador amplía la última tesela,
  que para leer alarmas es suficiente.

## Refresco

El trazado de Bogotá cambia poco. Conviene regenerar **cada tres meses**:

```
cd "D:\apps\capital-desk"
npm run mapa:generar
npm run mapa:verificar
```

La generación escribe a un temporal y renombra al final, así que la app sigue
sirviendo el mapa anterior mientras corre. Si una obra nueva no aparece durante unas
semanas, no afecta la lectura de alarmas.

## Si algo falla

- **El mapa sale sin fondo y aparece el aviso amarillo**: falta el archivo. Correr
  `npm run mapa:generar`. El aviso trae la ruta exacta donde se lo espera.
- **`No se encontro el ejecutable pmtiles`**: falta el paso 1 y 2 de la instalación.
- **`No se encontro ninguna compilacion publicada`**: el servidor no tiene salida a
  `build.protomaps.com`, o no hay compilación reciente. Mirar las fechas disponibles
  en https://maps.protomaps.com/builds/ y pasarla a mano:
  `npm run mapa:generar -- --fecha=20261001`.
- **`El archivo de mapa usa una compresion que no sabemos leer`**: el archivo se
  generó con otra herramienta. Regenerar con `npm run mapa:generar`.
- **Teselas en blanco solo en los bordes del mapa**: normal, es el límite del
  recuadro. Si hace falta más cobertura, ampliar `MAPA_BBOX`.
