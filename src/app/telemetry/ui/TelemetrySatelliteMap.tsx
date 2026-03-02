"use client";

import * as React from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { TelemetryMapPoint } from "./TelemetryDashboard";

type Props = {
  points: TelemetryMapPoint[];
  selectedBusId: string | null;
};

const BOGOTA: [number, number] = [4.60971, -74.08175];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO");
}

export default function TelemetrySatelliteMap({ points, selectedBusId }: Props) {
  const center = React.useMemo<[number, number]>(() => {
    if (selectedBusId) {
      const selected = points.find((point) => point.busId === selectedBusId);
      if (selected) return [selected.lat, selected.lng];
    }
    if (points.length > 0) return [points[0].lat, points[0].lng];
    return BOGOTA;
  }, [points, selectedBusId]);

  const zoom = selectedBusId ? 15 : points.length > 0 ? 11 : 10;

  if (points.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-muted/20 text-sm text-muted-foreground">
        Sin coordenadas disponibles para este filtro.
      </div>
    );
  }

  return (
    <MapContainer key={`${center[0]}-${center[1]}-${selectedBusId ?? "all"}`} center={center} zoom={zoom} className="h-[420px] w-full rounded-2xl">
      <TileLayer
        attribution='&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />

      {points.map((point) => {
        const isSelected = selectedBusId ? point.busId === selectedBusId : false;
        const color = isSelected ? "#22c55e" : "#38bdf8";

        return (
          <CircleMarker
            key={`${point.busId}-${point.lat}-${point.lng}`}
            center={[point.lat, point.lng]}
            radius={isSelected ? 10 : 7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: isSelected ? 3 : 2 }}
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-slate-900">{point.code}</div>
                <div className="text-slate-600">{point.plate ?? "Sin placa"}</div>
                <div>
                  Lat/Lng: {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                </div>
                <div>Última trama: {formatDateTime(point.lastSeenAt)}</div>
                <a
                  href={`https://www.google.com/maps?q=${point.lat},${point.lng}&t=k`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-md bg-slate-900 px-2 py-1 text-white"
                >
                  Abrir en satélite
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
