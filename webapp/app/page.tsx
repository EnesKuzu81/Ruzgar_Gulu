"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileArrowDown, SpinnerGap, WarningCircle, Wind, X } from "@phosphor-icons/react";
import Setup from "@/components/Setup";
import Results from "@/components/Results";
import type { Inputs, Meta, Result } from "@/lib/types";

// Analizi etkileyen girdiler (notlar, proje adı ve kapak bilgileri yeniden hesap gerektirmez)
const analysisKey = (i: Inputs, data: DataSel) => JSON.stringify({
  data, turbine: i.turbine, hub: i.hub, n: i.n, method: i.method, alpha: i.alpha, z0: i.z0_name, d: i.density,
  losses: i.losses, econ: i.econ,
});
type DataSel = { source: Inputs["source"]; lat: number; lon: number; y1: number; y2: number; stamp: number };

export default function Page() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [inp, setInp] = useState<Inputs | null>(null);
  const [data, setData] = useState<DataSel>({ source: "sample", lat: 38.42, lon: 27.14, y1: 2021, y2: 2025, stamp: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    fetch("/api/meta").then(r => r.json()).then((m: Meta) => {
      setMeta(m);
      const econ: Record<string, number | boolean> = {};
      for (const [k, v] of Object.entries(m.econ)) if (typeof v !== "string") econ[k] = v;
      const losses: Record<string, number> = {};
      for (const [k, v] of Object.entries(m.losses)) losses[k] = v.value;
      setInp({
        source: "sample", lat: 38.42, lon: 27.14, y1: m.years[0], y2: m.years[1], series: null,
        turbine: "E-82/2300", hub: 98, n: 1, method: "power", alpha: null, z0_name: "Nadas tarlası", density: "iec",
        losses, econ, ef: m.env.grid_emission_factor, kwh: m.env.household_consumption, notes: {},
        project: "İzmir Rüzgar Sahası", author: "", cover: {},
      });
    }).catch(() => setError("Sunucuya ulaşılamadı. Sayfayı yenileyip tekrar deneyin."));
  }, []);

  const set = useCallback((patch: Partial<Inputs>) => setInp(p => {
    if (!p) return p;
    const next = { ...p, ...patch };
    if (patch.source === "series") setData(d => ({ ...d, source: "series", lat: next.lat, lon: next.lon, stamp: Date.now() }));
    return next;
  }), []);
  const setEcon = useCallback((k: string, v: number | boolean) => setInp(p => (p ? { ...p, econ: { ...p.econ, [k]: v } } : p)), []);

  const body = useCallback((i: Inputs, d: DataSel) => ({
    source: d.source, lat: d.lat, lon: d.lon, y1: d.y1, y2: d.y2, series: d.source === "series" ? i.series : null,
    turbine: i.turbine, hub: i.hub, n: i.n, method: i.method, alpha: i.alpha, z0_name: i.z0_name, density: i.density,
    losses: i.losses, econ: i.econ, ef: i.ef, kwh: i.kwh, notes: i.notes, project: i.project, author: i.author, cover: i.cover,
  }), []);

  const key = inp ? analysisKey(inp, data) : "";
  useEffect(() => {
    if (!inp) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(inp, data)) });
        const j = await res.json();
        if (my !== seq.current) return;
        if (!res.ok) throw new Error(j.detail || "Hesap yapılamadı.");
        setResult(j); setError(null);
      } catch (e) {
        if (my === seq.current) setError(e instanceof Error ? e.message : "Hesap yapılamadı.");
      } finally { if (my === seq.current) setBusy(false); }
    }, result ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const dataStale = !!inp && data.source !== "series" && (Math.abs(inp.lat - data.lat) > 1e-4 || Math.abs(inp.lon - data.lon) > 1e-4);
  const fetchNasa = () => inp && setData({ source: "nasa", lat: inp.lat, lon: inp.lon, y1: inp.y1, y2: inp.y2, stamp: Date.now() });

  async function report() {
    if (!inp) return;
    setReporting(true);
    try {
      const res = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(inp, data)) });
      if (!res.ok) throw new Error((await res.json()).detail || "Rapor oluşturulamadı.");
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `${(inp.project || "rapor").replace(/\s+/g, "_")}.docx` });
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Rapor oluşturulamadı."); }
    finally { setReporting(false); }
  }

  const dataLabel = useMemo(() => result?.site.label ?? "İzmir örneği", [result]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white"><Wind size={20} weight="bold" /></span>
            <span className="leading-tight">
              <span className="block text-[0.95rem] font-semibold text-ink">Rüzgar Fizibilite</span>
              <span className="hidden text-[0.72rem] text-muted sm:block">Santral ön fizibilite aracı</span>
            </span>
          </div>
          <div className="mx-2 hidden h-7 w-px bg-line md:block" />
          <input aria-label="Proje adı" value={inp?.project ?? ""} onChange={e => set({ project: e.target.value })}
            className="hidden h-9 min-w-0 max-w-sm flex-1 rounded-md bg-transparent px-2 text-[0.92rem] font-medium text-ink outline-none ring-line transition hover:ring-1 focus:ring-2 focus:ring-brand md:block" />
          <div className="ml-auto flex items-center gap-3">
            <span className={`hidden items-center gap-1.5 text-[0.78rem] text-muted transition-opacity sm:flex ${busy ? "opacity-100" : "opacity-0"}`} aria-live="polite">
              <SpinnerGap size={14} className="animate-spin" /> Hesaplanıyor
            </span>
            <button type="button" onClick={report} disabled={!result || reporting}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 text-[0.85rem] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60">
              {reporting ? <SpinnerGap size={16} className="animate-spin" /> : <FileArrowDown size={16} weight="bold" />}
              <span className="hidden sm:inline">{reporting ? "Hazırlanıyor" : "Rapor indir"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1560px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1 lg:sticky lg:top-[88px] lg:max-h-[calc(100dvh-104px)] lg:overflow-y-auto rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]
                          [scrollbar-width:thin]">
          {meta && inp ? (
            <Setup meta={meta} inp={inp} set={set} setEcon={setEcon} dataLabel={dataLabel} dataStale={dataStale} onFetchNasa={fetchNasa} busy={busy} />
          ) : <div className="space-y-4 p-5">{[200, 120, 160, 140].map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>}
        </aside>

        <div className="order-1 min-w-0 lg:order-2">
          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl bg-coral-soft px-4 py-3 text-[0.88rem] text-coral ring-1 ring-coral/20">
              <WarningCircle size={18} weight="fill" className="mt-px flex-none" />
              <span className="flex-1">{error}</span>
              <button aria-label="Kapat" className="cursor-pointer" onClick={() => setError(null)}><X size={16} /></button>
            </div>
          )}
          {result && inp && meta ? (
            <Results r={result} inp={inp} meta={meta} set={set} onReport={report} reporting={reporting} />
          ) : (
            <div className="space-y-5">
              <div className="skeleton h-[230px] rounded-2xl" />
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-[118px] rounded-xl" />)}</div>
              <div className="skeleton h-[340px] rounded-xl" />
            </div>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-[1560px] px-4 pb-8 text-[0.75rem] text-faint sm:px-6">
        Veri: NASA POWER, MGM · Türbinler: windpowerlib · Harita: OpenFreeMap, © OpenStreetMap katkıcıları · İzmir Bakırçay Üniversitesi, EEM Rüzgar Enerjisi dersi
      </footer>
    </div>
  );
}
