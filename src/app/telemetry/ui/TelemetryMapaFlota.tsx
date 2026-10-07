"use client";

import * as React from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Popup, Tooltip, useMap } from "react-leaflet";
import type { TelemetryMapPoint } from "./TelemetryDashboard";
import { formatFechaHoraCO } from "@/lib/datetime";
import {
  AvisoSinMapaBase,
  BotonTema,
  CapaBase,
  FONDO_CLARO,
  FONDO_OSCURO,
  useEstadoMapaBase,
  type TemaMapa,
} from "@/components/mapa/CapaBasePropia";

/**
 * Mapa de la flota: ultima posicion conocida de cada bus.
 *
 * Antes era una foto satelital de Esri, que se veia bonita de lejos y no dejaba
 * leer en que via esta cada bus. Ahora usa el mapa base propio, el mismo del
 * tablero de alarmas. Ver docs/mapa-propio.md.
 */

type Props = {
  points: TelemetryMapPoint[];
  selectedBusId: string | null;
};

const BOGOTA: [number, number] = [4.60971, -74.08175];

const COLOR_PUNTO = "#2a78d6";
const COLOR_SELECCIONADO = "#0a7f0a";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return formatFechaHoraCO(d);
}

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n);
}

/**
 * Encaja la vista a los puntos, o al bus seleccionado. No usamos `key` en el
 * MapContainer para no destruir y rehacer el mapa entero en cada cambio de
 * filtro, que era lo que hacia la version anterior.
 */
function Encuadrar({
  points,
  selectedBusId,
}: {
  points: TelemetryMapPoint[];
  selectedBusId: string | null;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (selectedBusId) {
      const sel = points.find((p) => p.busId === selectedBusId);
      if (sel) {
        map.setView([sel.lat, sel.lng], 16);
        return;
      }
    }
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
  }, [map, points, selectedBusId]);

  return null;
}

export default function TelemetryMapaFlota({ points, selectedBusId }: Props) {
  const [tema, setTema] = React.useState<TemaMapa>("claro");
  const estado = useEstadoMapaBase();
  const baseLista = estado?.disponible === true;

  if (points.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-muted/20 text-sm text-muted-foreground">
        Sin coordenadas disponibles para este filtro.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={BOGOTA}
        zoom={11}
        scrollWheelZoom
        className="h-[420px] w-full"
        zoomControl={false}
        style={{ background: tema === "oscuro" ? FONDO_OSCURO : FONDO_CLARO }}
      >
        <CapaBase tema={tema} activa={baseLista} />
        <Encuadrar points={points} selectedBusId={selectedBusId} />

        {points.map((point) => {
          const seleccionado = selectedBusId ? point.busId === selectedBusId : false;
          const color = seleccionado ? COLOR_SELECCIONADO : COLOR_PUNTO;

          return (
            <CircleMarker
              key={`${point.busId}-${point.lat}-${point.lng}`}
              center={[point.lat, point.lng]}
              radius={seleccionado ? 9 : 6}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: color,
                fillOpacity: 0.95,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="text-xs font-medium">{point.code}</span>
              </Tooltip>
              <Popup>
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-semibold text-slate-900">{point.code}</div>
                  <div className="text-slate-600">{point.plate ?? "Sin placa"}</div>
                  <div className="text-slate-600">
                    Última trama: {formatDateTime(point.lastSeenAt)}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${point.lat},${point.lng}&t=k`}
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
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-2">
        <div className="pointer-events-auto rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Buses en el mapa
          </p>
          <p className="text-lg font-semibold leading-tight tabular-nums">{nfmt(points.length)}</p>
        </div>
        <BotonTema tema={tema} onCambiar={() => setTema((t) => (t === "claro" ? "oscuro" : "claro"))} disponible={baseLista} />
      </div>

      <AvisoSinMapaBase estado={estado} />
    </div>
  );
}
