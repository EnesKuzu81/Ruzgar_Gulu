// Tarayıcıda dosya okuma: MGM zip (Excel) ve ölçüm CSV'si. Sunucuya yalnızca saatlik diziler gider
// (Vercel istek sınırı 4.5 MB; MGM zip'i ~7 MB). Mantık core/data_sources.py ile aynıdır.
import type { Series } from "./types";

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const MGM_UTC_OFFSET = 3; // MGM saatleri yerel saat (TSİ) kabul edilir (config/defaults.yaml: mgm_utc_offset)

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function mgmTime(r: Row): string | null {
  const y = num(r.YIL), m = num(r.AY), d = num(r.GUN), h = num(r.SAAT);
  if (y === null || m === null || d === null || h === null) return null;
  return new Date(Date.UTC(y, m - 1, d, h - MGM_UTC_OFFSET)).toISOString();
}

function parseWind(code: unknown): [number | null, number | null] {
  const m = String(code ?? "").match(/^\s*([A-Za-z]*)\s*([-\d.,]*)\s*$/);
  if (!m) return [null, null];
  const dir = m[1].toUpperCase();
  let ws = num(m[2]);
  if (dir === "C") return [null, 0]; // sakin
  const i = COMPASS.indexOf(dir);
  return [i >= 0 ? i * 22.5 : null, ws];
}

export async function readMgmZip(file: File): Promise<{ series: Series; lat?: number; lon?: number; station?: string }> {
  const [{ default: JSZip }, XLSX] = await Promise.all([import("jszip"), import("xlsx")]);
  const zip = await JSZip.loadAsync(file);
  const sheets: Record<string, Row[]> = {};
  let info: string | null = null;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (/\.txt$/i.test(entry.name)) { info = await entry.async("string"); continue; }
    if (!/\.xlsx$/i.test(entry.name)) continue;
    const wb = XLSX.read(await entry.async("arraybuffer"), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: null });
    const head = Object.keys(rows[0] ?? {}).join(" ").toUpperCase();
    if (head.includes("RUZGAR")) sheets.wind = rows;
    else if (head.includes("SICAKLIK")) sheets.temp = rows;
    else if (head.includes("BASINC")) sheets.pres = rows;
  }
  if (!sheets.wind) throw new Error("Zip içinde 'Saatlik Rüzgar Yönü ve Hızı' Excel dosyası bulunamadı.");

  const valueKey = (rows: Row[]) => Object.keys(rows[0]).slice(-1)[0];
  const byTime = (rows: Row[] | undefined, scale: number) => {
    const map = new Map<string, number | null>();
    if (!rows) return map;
    const k = valueKey(rows);
    for (const r of rows) { const t = mgmTime(r); if (t) { const v = num(r[k]); map.set(t, v === null ? null : v * scale); } }
    return map;
  };
  const temp = byTime(sheets.temp, 1), pres = byTime(sheets.pres, 0.1); // hPa -> kPa
  const wk = valueKey(sheets.wind);
  const s: Series = { time: [], ws: [], wd: [], t2m_c: [], ps_kpa: [], label: "MGM istasyon ölçümü", height: 10 };
  for (const r of sheets.wind) {
    const t = mgmTime(r);
    if (!t) continue;
    const [wd, ws] = parseWind(r[wk]);
    s.time.push(t); s.ws.push(ws); s.wd!.push(wd);
    s.t2m_c!.push(temp.get(t) ?? null); s.ps_kpa!.push(pres.get(t) ?? null);
  }
  if (!sheets.temp) delete s.t2m_c;
  if (!sheets.pres) delete s.ps_kpa;

  let lat: number | undefined, lon: number | undefined, station: string | undefined;
  const line = info?.split(/\r?\n/).filter(l => l.includes("|"))[1];
  if (line) {
    const v = line.split("|");
    station = v[0]?.trim();
    lat = num(v[4]) ?? undefined; lon = num(v[5]) ?? undefined;
  }
  if (station) s.label = `MGM istasyon ${station}`;
  return { series: s, lat, lon, station };
}

const ALIASES: Record<string, string[]> = {
  time: ["time", "timestamp", "datetime", "date", "zaman", "tarih"],
  ws: ["ws", "speed", "wind_speed", "windspeed", "hiz", "ruzgar_hizi", "v"],
  wd: ["wd", "dir", "direction", "wind_dir", "yon", "ruzgar_yonu"],
  t2m_c: ["t", "temp", "temperature", "sicaklik", "t2m"],
  ps_kpa: ["p", "pressure", "basinc", "ps"],
};
const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR")
  .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/\s+/g, "_");

export async function readCsv(file: File, height: number): Promise<Series> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map(norm);
  const col: Record<string, number> = {};
  for (const [key, al] of Object.entries(ALIASES)) {
    const i = head.findIndex(h => al.some(a => h === a || h.startsWith(a + "_")));
    if (i >= 0 && !Object.values(col).includes(i)) col[key] = i;
  }
  if (col.time === undefined || col.ws === undefined) throw new Error("CSV'de zaman ve rüzgar hızı sütunları bulunamadı.");
  const s: Series = { time: [], ws: [], label: `ölçüm (${height} m)`, height };
  if (col.wd !== undefined) s.wd = [];
  if (col.t2m_c !== undefined) s.t2m_c = [];
  if (col.ps_kpa !== undefined) s.ps_kpa = [];
  for (const l of lines.slice(1)) {
    const v = l.split(sep);
    const t = new Date(v[col.time]);
    if (Number.isNaN(t.getTime())) continue;
    s.time.push(t.toISOString()); s.ws.push(num(v[col.ws]));
    if (s.wd) s.wd.push(num(v[col.wd]));
    if (s.t2m_c) s.t2m_c.push(num(v[col.t2m_c]));
    if (s.ps_kpa) s.ps_kpa.push(num(v[col.ps_kpa]));
  }
  if (!s.time.length) throw new Error("CSV'de okunabilir satır bulunamadı.");
  return s;
}
