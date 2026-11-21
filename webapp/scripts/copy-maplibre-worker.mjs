// MapLibre işçisi (worker) ayrı modül dosyalarıdır; Next.js paketlemesi bunları sunmadığı için public/ altına kopyalanır.
import { copyFileSync, mkdirSync } from "node:fs";
const dist = "node_modules/maplibre-gl/dist";
mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`${dist}/${f}`, `public/maplibre/${f}`);
console.log("maplibre worker kopyalandı");
