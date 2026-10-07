"use client";

import * as React from "react";
import type L from "leaflet";
import { useMap } from "react-leaflet";
import { leafletLayer } from "protomaps-leaflet";

/**
 * Capa base del mapa, servida por nosotros.
 *
 * Un solo lugar que sabe de donde salen las teselas, hasta que zoom hay dato y
 * que credito hay que mostrar. Todos los mapas de la aplicacion la usan, para
 * que no vuelva a pasar que una pantalla quede con un proveedor externo y otra
 * no. Ver docs/mapa-propio.md.
 */

/** Hasta donde trae datos el archivo; mas alla el renderizador amplia la ultima tesela. */
export const ZOOM_MAXIMO_DATOS = 15;

const URL_TESELAS = "/api/mapa/teselas/{z}/{x}/{y}.mvt";

const ATRIBUCION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · teselas propias';

export const FONDO_CLARO = "#eef1f5";
export const FONDO_OSCURO = "#0f1620";

export type TemaMapa = "claro" | "oscuro";

export type EstadoMapaBase =
  | { disponible: true; actualizado: string; maxZoom: number }
  | { disponible: false; motivo: string };

/**
 * Consulta una sola vez si el archivo de teselas esta montado, para poder
 * avisar en vez de dejar un rectangulo gris sin explicacion.
 */
export function useEstadoMapaBase(): EstadoMapaBase | null {
  const [estado, setEstado] = React.useState<EstadoMapaBase | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/mapa/estado")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: EstadoMapaBase) => {
        if (vivo) setEstado(d);
      })
      .catch(() => {
        if (vivo) setEstado({ disponible: false, motivo: "No se pudo consultar el mapa base." });
      });
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}

/**
 * Se reconstruye al cambiar de tema porque las reglas de pintado de
 * protomaps-leaflet se fijan al crear la capa.
 */
export function CapaBase({ tema, activa }: { tema: TemaMapa; activa: boolean }) {
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

/** Aviso flotante cuando todavia no se ha generado el archivo de teselas. */
export function AvisoSinMapaBase({ estado }: { estado: EstadoMapaBase | null }) {
  if (!estado || estado.disponible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex justify-center">
      <div className="pointer-events-auto max-w-md rounded-lg border border-[#f0d79a] bg-[#fff8e6] px-3 py-2 text-[11px] leading-snug text-[#4d3c0d] shadow-sm">
        <span className="font-semibold">Mapa base sin generar.</span> Los puntos son correctos, pero
        falta el fondo. {estado.motivo}
      </div>
    </div>
  );
}

/** Boton para alternar entre fondo claro y oscuro. */
export function BotonTema({
  tema,
  onCambiar,
  disponible,
}: {
  tema: TemaMapa;
  onCambiar: () => void;
  disponible: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onCambiar}
      disabled={!disponible}
      className="pointer-events-auto rounded-lg border border-border/70 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {tema === "claro" ? "Fondo oscuro" : "Fondo claro"}
    </button>
  );
}
