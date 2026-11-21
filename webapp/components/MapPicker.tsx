"use client";
// Konum seçici: MapLibre + OpenFreeMap (anahtar gerektirmez). Haritaya tıklamak konumu değiştirir.
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = { lat: number; lon: number; onPick: (lat: number, lon: number) => void; height?: number };

export default function MapPicker({ lat, lon, onPick, height = 220 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("maplibre-gl").Map | null>(null);
  const marker = useRef<import("maplibre-gl").Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then(mod => {
      const maplibregl = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      if (cancelled || !el.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");   // public/ altına kopyalanan işçi
      const m = new maplibregl.Map({
        container: el.current, style: "https://tiles.openfreemap.org/styles/positron",
        center: [lon, lat], zoom: 7.2, attributionControl: { compact: true }, cooperativeGestures: false,
      });
      m.scrollZoom.disable();             // sayfa kaydırılırken harita yakınlaşmasın
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const dot = document.createElement("div");
      dot.className = "h-4 w-4 rounded-full bg-[var(--color-brand)] ring-4 ring-white shadow-[0_0_0_6px_rgb(11_107_79/0.25)]";
      marker.current = new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(m);
      m.getCanvas().style.cursor = "crosshair";
      m.on("click", (e: import("maplibre-gl").MapMouseEvent) => pick.current(Number(e.lngLat.lat.toFixed(4)), Number(e.lngLat.lng.toFixed(4))));
      map.current = m;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    marker.current?.setLngLat([lon, lat]);
    map.current?.easeTo({ center: [lon, lat], duration: 400 });
  }, [lat, lon]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg border border-line" aria-label="Konum seçme haritası" />;
}
