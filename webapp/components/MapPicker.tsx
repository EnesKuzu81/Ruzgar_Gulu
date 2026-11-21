"use client";
// Konum seçici: MapLibre + OpenFreeMap (anahtar gerektirmez). Haritaya tıklamak konumu değiştirir.
// Bazı ağlar vektör harita sunucusunu engelleyebilir: stil 6 sn içinde yüklenmezse OpenStreetMap karolarına geçilir,
// o da olmazsa kullanıcıya koordinatları elle girebileceği söylenir.
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

type Props = { lat: number; lon: number; onPick: (lat: number, lon: number) => void; height?: number };

const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/positron";
const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19,
           attribution: "© OpenStreetMap katkıcıları" },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6, "raster-opacity": 0.9 } }],
};

export default function MapPicker({ lat, lon, onPick, height = 220 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("maplibre-gl").Map | null>(null);
  const marker = useRef<import("maplibre-gl").Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    import("maplibre-gl").then(mod => {
      const maplibregl = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      if (cancelled || !el.current) return;
      try {
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");   // public/ altına kopyalanan işçi
        const m = new maplibregl.Map({
          container: el.current, style: VECTOR_STYLE, center: [lon, lat], zoom: 7.2,
          attributionControl: { compact: true }, cooperativeGestures: false,
        });
        let stage: "vector" | "raster" | "done" = "vector";
        const fallback = () => {
          if (stage === "vector") {
            stage = "raster"; m.setStyle(RASTER_STYLE);
            clearTimeout(timer); timer = setTimeout(() => { if (stage !== "done") setFailed(true); }, 8000);
          } else if (stage === "raster") setFailed(true);
        };
        timer = setTimeout(() => { if (stage === "vector") fallback(); }, 6000);
        m.on("idle", () => { stage = "done"; clearTimeout(timer); });
        m.on("error", () => { if (stage !== "done") fallback(); });
        m.scrollZoom.disable();             // sayfa kaydırılırken harita yakınlaşmasın
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        const dot = document.createElement("div");
        dot.className = "h-4 w-4 rounded-full bg-[var(--color-brand)] ring-4 ring-white shadow-[0_0_0_6px_rgb(11_107_79/0.25)]";
        marker.current = new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(m);
        m.getCanvas().style.cursor = "crosshair";
        m.on("click", (e: import("maplibre-gl").MapMouseEvent) => pick.current(Number(e.lngLat.lat.toFixed(4)), Number(e.lngLat.lng.toFixed(4))));
        map.current = m;
      } catch {
        setFailed(true);
      }
    }).catch(() => setFailed(true));
    return () => { cancelled = true; clearTimeout(timer); map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    marker.current?.setLngLat([lon, lat]);
    map.current?.easeTo({ center: [lon, lat], duration: 400 });
  }, [lat, lon]);

  return (
    <div className="relative">
      <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg border border-line bg-sunken" aria-label="Konum seçme haritası" />
      {failed && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-lg border border-line bg-sunken px-6 text-center text-[0.82rem] text-muted">
          Harita bu ağda yüklenemedi. Konumu aşağıdaki enlem ve boylam kutularına elle girebilirsiniz.
        </div>
      )}
    </div>
  );
}
