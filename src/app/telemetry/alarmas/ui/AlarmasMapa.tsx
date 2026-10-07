"use client";

import * as React from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { leafletLayer } from "protomaps-leaflet";
import type { EventoAlarma } from "@/lib/telemetry/alarms";
import { formatFechaHoraCO } from "@/lib/datetime";

/**
 * Mapa de alarmas con agrupacion propia y mapa base propio.
 *
 * El fondo lo dibuja protomaps-leaflet con las teselas vectoriales que sirve
 * nuestra propia API (/api/mapa/teselas), leidas de un archivo PMTiles en el
 * disco del servidor. No hay proveedor externo, ni llave de API, ni cuota
 * mensual: el unico requisito de la licencia de OpenStreetMap es dejar el
 * credito visible, que va en la atribucion de la esquina. Ver docs/mapa-propio.md.
 *
 * Los puntos no usan libreria de clustering: se agrupan por celda de pixeles
 * sobre el viewport actual, de modo que al acercar el zoom los grupos se abren
 * solos. El color del grupo lo manda su alarma mas severa, y el numero siempre
 * va escrito encima: el color nunca carga solo con el significado.
 */

const BOGOTA: [number, number] = [4.60971, -74.08175];
const CELDA_PX = 56;

/** Hasta donde trae datos el archivo; mas alla el renderizador amplia la ultima tesela. */
const ZOOM_MAXIMO_DATOS = 15;
const URL_TESELAS = "/api/mapa/teselas/{z}/{x}/{y}.mvt";
const ATRIBUCION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · teselas propias';

const COLOR_NIVEL: Record<string, string> = {
  N1: "#d03b3b",
  N2: "#ec835a",
  N3: "#898781",
  N4: "#fab219",
  N5: "#2a78d6",
};

const ORDEN_SEVERIDAD = ["N1", "N5", "N2", "N4", "N3"];

type Tema = "claro" | "oscuro";

type EstadoMapa =
  | { disponible: true; actualizado: string; maxZoom: number }
  | { disponible: false; motivo: string };

function peorNivel(items: EventoAlarma[]): string {
  for (const n of ORDEN_SEVERIDAD) if (items.some((e) => e.level === n)) return n;
  return items[0]?.level ?? "N3";
}

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n);
}

type Grupo = { lat: number; lng: number; items: EventoAlarma[] };

function PopupEvento({ e }: { e: EventoAlarma }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="text-sm font-semibold text-slate-900">{e.busCode}</div>
      <div className="font-medium text-slate-700">{e.label}</div>
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
  );
}

/**
 * Capa base servida por nosotros. Se reconstruye al cambiar de tema porque las
 * reglas de pintado de protomaps-leaflet se fijan al crear la capa.
 */
function CapaBase({ tema, activa }: { tema: Tema; activa: boolean }) {
  const map = useMap();

  React.useEffect(() => {
    if (!activa) return;

    const capa = leafletLayer({
      url: URL_TESELAS,
      flavor: tema === "oscuro" ? "dark" : "light",
      maxDataZoom: ZOOM_MAXIMO_DATOS,
      lang: "es",
      attribution: ATRIBUCION,
    }) as unknown as L.Layer;

    capa.addTo(map);
    return () => {
      map.removeLayer(capa);
    };
  }, [map, tema, activa]);

  return null;
}

/** Encaja la vista a los puntos la primera vez que hay datos. */
function EncajarVista({ puntos }: { puntos: EventoAlarma[] }) {
  const map = useMap();
  const yaEncajo = React.useRef(false);

  React.useEffect(() => {
    if (yaEncajo.current || puntos.length === 0) return;
    const bounds = L.latLngBounds(puntos.map((p) => [p.lat as number, p.lng as number]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
      yaEncajo.current = true;
    }
  }, [map, puntos]);

  return null;
}

function Agrupados({ puntos }: { puntos: EventoAlarma[] }) {
  const map = useMap();
  const [version, setVersion] = React.useState(0);

  useMapEvents({
    zoomend: () => setVersion((v) => v + 1),
    moveend: () => setVersion((v) => v + 1),
  });

  const grupos = React.useMemo<Grupo[]>(() => {
    const celdas = new Map<string, EventoAlarma[]>();
    for (const e of puntos) {
      const p = map.latLngToContainerPoint([e.lat as number, e.lng as number]);
      const clave = `${Math.floor(p.x / CELDA_PX)}:${Math.floor(p.y / CELDA_PX)}`;
      const lista = celdas.get(clave);
      if (lista) lista.push(e);
      else celdas.set(clave, [e]);
    }
    return [...celdas.values()].map((items) => ({
      lat: items.reduce((a, e) => a + (e.lat as number), 0) / items.length,
      lng: items.reduce((a, e) => a + (e.lng as number), 0) / items.length,
      items,
    }));
    // version fuerza el recalculo al mover o hacer zoom

  }, [puntos, map, version]);

  return (
    <>
      {grupos.map((g) => {
        const nivel = peorNivel(g.items);
        const color = COLOR_NIVEL[nivel] ?? "#2a78d6";

        if (g.items.length === 1) {
          const e = g.items[0];
          const critica = e.level === "N1" || e.level === "N5";
          return (
            <CircleMarker
              key={e.id}
              center={[e.lat as number, e.lng as number]}
              radius={critica ? 8 : 6}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: color,
                fillOpacity: 0.95,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="text-xs font-medium">
                  {e.busCode} · {e.code}
                </span>
              </Tooltip>
              <Popup>
                <PopupEvento e={e} />
              </Popup>
            </CircleMarker>
          );
        }

        const n = g.items.length;
        const tam = n >= 100 ? 52 : n >= 25 ? 44 : 36;
        const icono = L.divIcon({
          className: "",
          iconSize: [tam, tam],
          iconAnchor: [tam / 2, tam / 2],
          html: `<div style="
              width:${tam}px;height:${tam}px;border-radius:9999px;
              background:${color}; box-shadow:0 0 0 4px ${color}33, 0 1px 3px rgba(0,0,0,.35);
              color:#fff;display:flex;align-items:center;justify-content:center;
              font:600 ${n >= 100 ? 13 : 12}px system-ui,-apple-system,'Segoe UI',sans-serif;
              font-variant-numeric:tabular-nums;border:2px solid rgba(255,255,255,.9);
            ">${nfmt(n)}</div>`,
        });

        const resumen = new Map<string, number>();
        for (const e of g.items) resumen.set(e.code, (resumen.get(e.code) ?? 0) + 1);
        const top = [...resumen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

        return (
          <Marker
            key={`g-${g.lat.toFixed(5)}-${g.lng.toFixed(5)}-${n}`}
            position={[g.lat, g.lng]}
            icon={icono}
            eventHandlers={{
              click: () => map.setView([g.lat, g.lng], Math.min(18, map.getZoom() + 2)),
            }}
          >
            <Tooltip direction="top" offset={[0, -16]}>
              <div className="text-xs">
                <div className="font-semibold">{nfmt(n)} alarmas</div>
                {top.map(([code, c]) => (
                  <div key={code}>
                    {code}: {nfmt(c)}
                  </div>
                ))}
                <div className="mt-1 text-[10px] opacity-70">Clic para acercar</div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export default function AlarmasMapa({ eventos }: { eventos: EventoAlarma[] }) {
  const [soloCriticas, setSoloCriticas] = React.useState(false);
  const [tema, setTema] = React.useState<Tema>("claro");
  const [estado, setEstado] = React.useState<EstadoMapa | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/mapa/estado")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: EstadoMapa) => {
        if (vivo) setEstado(d);
      })
      .catch(() => {
        if (vivo) setEstado({ disponible: false, motivo: "No se pudo consultar el mapa base." });
      });
    return () => {
      vivo = false;
    };
  }, []);

  const conGps = React.useMemo(
    () => eventos.filter((e) => e.lat != null && e.lng != null),
    [eventos]
  );
  const puntos = React.useMemo(
    () => (soloCriticas ? conGps.filter((e) => e.level === "N1" || e.level === "N5") : conGps),
    [conGps, soloCriticas]
  );

  const sinGps = eventos.length - conGps.length;
  const baseLista = estado?.disponible === true;

  if (conGps.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">
        Las alarmas de este filtro no traen coordenadas válidas.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={BOGOTA}
        zoom={11}
        scrollWheelZoom
        className="h-[480px] w-full"
        zoomControl={false}
        style={{ background: tema === "oscuro" ? "#0f1620" : "#eef1f5" }}
      >
        <CapaBase tema={tema} activa={baseLista} />
        <EncajarVista puntos={puntos} />
        <Agrupados puntos={puntos} />
      </MapContainer>

      {/* Barra de control sobre el mapa */}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-2">
        <div className="pointer-events-auto rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Alarmas en el mapa
          </p>
          <p className="text-lg font-semibold leading-tight tabular-nums">{nfmt(puntos.length)}</p>
          {sinGps > 0 ? (
            <p className="text-[11px] text-muted-foreground">{nfmt(sinGps)} sin GPS</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setSoloCriticas((v) => !v)}
          className={`pointer-events-auto rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition ${
            soloCriticas
              ? "border-transparent bg-[#d03b3b] text-white"
              : "border-border/70 bg-background/95 text-foreground hover:bg-muted/60"
          }`}
        >
          {soloCriticas ? "Viendo solo críticas" : "Ver solo críticas"}
        </button>

        <button
          type="button"
          onClick={() => setTema((t) => (t === "claro" ? "oscuro" : "claro"))}
          disabled={!baseLista}
          className="pointer-events-auto rounded-lg border border-border/70 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tema === "claro" ? "Fondo oscuro" : "Fondo claro"}
        </button>
      </div>

      {/* Aviso si el archivo de teselas todavia no esta en el servidor */}
      {estado && !estado.disponible ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex justify-center">
          <div className="pointer-events-auto max-w-md rounded-lg border border-[#f0d79a] bg-[#fff8e6] px-3 py-2 text-[11px] leading-snug text-[#4d3c0d] shadow-sm">
            <span className="font-semibold">Mapa base sin generar.</span> Los puntos son correctos,
            pero falta el fondo. {estado.motivo}
          </div>
        </div>
      ) : null}

      {/* Leyenda */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Nivel</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {["N1", "N2", "N3", "N4", "N5"].map((n) => (
            <li key={n} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_NIVEL[n] }} />
              {n}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Los círculos con número agrupan varias alarmas. Haz clic para acercar.
        </p>
      </div>
    </div>
  );
}
