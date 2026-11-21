// Türkçe sayı biçimleri: 5.567 · 6,83 · %27,6
export function fmt(v: number | null | undefined, d = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function pct(v: number | null | undefined, d = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return "%" + fmt(v * 100, d);
}

export function money(v: number | null | undefined, cur = "USD"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `${fmt(v / 1e6, 2)} M ${cur}`;
  if (a >= 1e3) return `${fmt(v / 1e3, 0)} bin ${cur}`;
  return `${fmt(v, 0)} ${cur}`;
}

export const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// grafik paleti (globals.css ile aynı)
export const C = {
  brand: "#0b6b4f", brandSoft: "rgba(11, 107, 79, 0.18)", brandMid: "#5aa58a",
  sky: "#2e7bbf", amber: "#d18b12", coral: "#c2413f", ink: "#0e1714", muted: "#5f6b66",
  faint: "#8a958f", line: "#e2e7e4", grid: "#edf0ee",
};
