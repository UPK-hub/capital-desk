"use client";

import * as React from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { EventoAlarma } from "@/lib/telemetry/alarms";
import { formatFechaHoraCO } from "@/lib/datetime";

/**
 * Mapa de alarmas.
 *
 * Agrupa los puntos cercanos en burbujas con el conteo (sin dependencias
 * nuevas: la agrupacion es por rejilla y se recalcula con el zoom), deja
 * cambiar el mapa base y encuadra la vista sobre los datos.
 */

const BOGOTA: [number, number] = [4.60971, -74.08175];

const COLOR_NIVEL: Record<string, string> = {
  N1: "#d03b3b",
  N2: "#ec835a",
  N3: "#898781",
  N4: "#fab219",
  N5: "#2a78d6",
};

const NIVEL_ETIQUETA: Record<string, string> = {
  N1: "Crítico superior",
  N2: "Tolerable superior",
  N3: "Normal",
  N4: "Tolerable inferior",
  N5: "Crítico inferior",
};

type Base = { clave: string; etiqueta: string; url: string; attribution: string; oscuro?: boolean };

const BASES: Base[] = [
  {
    clave: "claro",
    etiqueta: "Claro",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  },
  {
    clave: "oscuro",
    etiqueta: "Oscuro",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    oscuro: true,
  },
  {
    clave: "satelite",
    etiqueta: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri, Maxar, Earthstar Geographics",
    oscuro: true,
  },
];

type Punto = EventoAlarma & { lat: number; lng: number };
type Grupo = { lat: number; lng: number; puntos: Punto[] };

/** Tamano de celda en grados segun el zoom. Mas zoom, celdas mas finas. */
function celdaPorZoom(zoom: number) {
  return 0.6 / Math.pow(2, Math.max(0, zoom - 8));
}

function agrupar(puntos: Punto[], zoom: number): Grupo[] {
  if (zoom >= 16) return puntos.map((p) => ({ lat: p.lat, lng: p.lng, puntos: [p] }));
  const celda = celdaPorZoom(zoom);
  const mapa = new Map<string, Grupo>();
  for (const p of puntos) {
    const clave = `${Math.round(p.lat / celda)}|${Math.round(p.lng / celda)}`;
    const g = mapa.get(clave);
    if (g) {
      g.puntos.push(p);
      g.lat = (g.lat * (g.puntos.length - 1) + p.lat) / g.puntos.length;
      g.lng = (g.lng * (g.puntos.length - 1) + p.lng) / g.puntos.length;
    } else {
      mapa.set(clave, { lat: p.lat, lng: p.lng, puntos: [p] });
    }
  }
  return [...mapa.values()];
}

/** Color de un grupo: manda la severidad mas alta que contenga. */
function colorGrupo(g: Grupo) {
  if (g.puntos.some((p) => p.level === "N1")) return COLOR_NIVEL.N1;
  if (g.puntos.some((p) => p.level === "N5")) return COLOR_NIVEL.N5;
  if (g.puntos.some((p) => p.level === "N2")) return COLOR_NIVEL.N2;
  if (g.puntos.some((p) => p.level === "N4")) return COLOR_NIVEL.N4;
  return COLOR_NIVEL.N3;
}

function iconoGrupo(cantidad: number, color: string) {
  const tam = cantidad >= 100 ? 50 : cantidad >= 25 ? 42 : 34;
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:${tam}px;height:${tam}px;border-radius:9999px;
        display:flex;align-items:center;justify-content:center;
        background:${color};color:#fff;
        font:600 ${cantidad >= 100 ? 13 : 12}px system-ui,-apple-system,'Segoe UI',sans-serif;
        box-shadow:0 0 0 ${Math.round(tam * 0.18)}px ${color}33, 0 2px 8px rgba(0,0,0,.35);
        border:2px solid rgba(255,255,255,.9);
      ">${cantidad}</div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  });
}

/** Encuadra la vista sobre todos los puntos la primera vez. */
function Encuadrar({ puntos }: { puntos: Punto[] }) {
  const map = useMap();
  const hecho = React.useRef(false);
  React.useEffect(() => {
    if (hecho.current || puntos.length === 0) return;
    hecho.current = true;
    const bounds = L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, puntos]);
  return null;
}

function Capas({ puntos }: { puntos: Punto[] }) {
  const map = useMap();
  const [zoom, setZoom] = React.useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const grupos = React.useMemo(() => agrupar(puntos, zoom), [puntos, zoom]);

  return (
    <>
      {grupos.map((g, i) => {
        const color = colorGrupo(g);

        if (g.puntos.length > 1) {
          return (
            <Marker
              key={`g-${i}-${g.lat.toFixed(4)}-${g.lng.toFixed(4)}`}
              position={[g.lat, g.lng]}
              icon={iconoGrupo(g.puntos.length, color)}
              eventHandlers={{
                click: () => map.flyTo([g.lat, g.lng], Math.min(17, map.getZoom() + 3), { duration: 0.6 }),
              }}
            />
          );
        }

        const e = g.puntos[0];
        const critica = e.level === "N1" || e.level === "N5";
        return (
          <CircleMarker
            key={e.id}
            center={[e.lat, e.lng]}
            radius={critica ? 9 : 6}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: color,
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <div className="text-sm font-semibold text-slate-900">{e.busCode}</div>
                <div className="font-medium" style={{ color }}>
                  {e.label}
                </div>
                <div className="text-slate-600">
                  Nivel {e.level}
                  {e.levelLabel ? ` · ${e.levelLabel}` : ""}
                </div>
                {e.velocidad != null ? (
                  <div className="text-slate-600">Velocidad: {e.velocidad} km/h</div>
                ) : null}
                <div className="text-slate-600">
                  {e.eventAt ? formatFechaHoraCO(new Date(e.eventAt)) : "Sin fecha"}
                </div>
                <a
                  href={`https://www.google.com/maps?q=${e.lat},${e.lng}&t=k`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block rounded-md bg-slate-900 px-2 py-1 text-white"
                >
                  Ver en satélite
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default function AlarmasMapa({ eventos }: { eventos: EventoAlarma[] }) {
  const [base, setBase] = React.useState<Base>(BASES[0]);

  const puntos = React.useMemo(
    () =>
      eventos.filter((e): e is Punto => e.lat != null && e.lng != null),
    [eventos]
  );

  const niveles = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of puntos) m.set(p.level || "N3", (m.get(p.level || "N3") ?? 0) + 1);
    return ["N1", "N2", "N3", "N4", "N5"].filter((n) => (m.get(n) ?? 0) > 0).map((n) => ({ n, c: m.get(n) ?? 0 }));
  }, [puntos]);

  if (puntos.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">
        Las alarmas de este filtro no traen coordenadas válidas.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-border/70">
      <MapContainer
        center={BOGOTA}
        zoom={11}
        scrollWheelZoom
        className="h-[520px] w-full"
        preferCanvas
      >
        <TileLayer key={base.clave} attribution={base.attribution} url={base.url} />
        <Encuadrar puntos={puntos} />
        <Capas puntos={puntos} />
      </MapContainer>

      {/* Selector de mapa base */}
      <div className="pointer-events-auto absolute right-3 top-3 z-[1000] flex gap-1 rounded-lg border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur">
        {BASES.map((b) => (
          <button
            key={b.clave}
            type="button"
            onClick={() => setBase(b)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              base.clave === b.clave
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {b.etiqueta}
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {puntos.length} alarmas ubicadas
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {niveles.map(({ n, c }) => (
            <li key={n} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_NIVEL[n] }} />
              <span className="font-medium text-foreground">{n}</span>
              <span className="hidden sm:inline">{NIVEL_ETIQUETA[n]}</span>
              <span className="tabular-nums">{c}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Las burbujas agrupan alarmas cercanas. Haz clic para acercarte.
        </p>
      </div>
    </div>
  );
}
