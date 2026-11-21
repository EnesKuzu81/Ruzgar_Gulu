"use client";
// Sol panel: kurulum adımları (konum, veri, türbin, ekonomi, gelişmiş).
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowsClockwise, CaretDown, CheckCircle, Minus, Plus, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { Label, NumberField, Segmented, Slider, Step } from "./ui";
import { fmt } from "@/lib/format";
import { readCsv, readMgmZip } from "@/lib/upload";
import type { Inputs, Meta } from "@/lib/types";

const MapPicker = dynamic(() => import("./MapPicker"), { ssr: false, loading: () => <div className="skeleton h-[200px]" /> });

type DataMode = "nasa" | "mgm" | "csv";
type Props = {
  meta: Meta; inp: Inputs; set: (patch: Partial<Inputs>) => void; setEcon: (k: string, v: number | boolean) => void;
  dataLabel: string; dataStale: boolean; onFetchNasa: () => void; busy: boolean;
};

export default function Setup({ meta, inp, set, setEcon, dataLabel, dataStale, onFetchNasa, busy }: Props) {
  const [mode, setMode] = useState<DataMode>(inp.source === "series" ? "mgm" : "nasa");
  const [height, setHeight] = useState(10);
  const [fileMsg, setFileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const turbine = meta.turbines.find(t => t.type === inp.turbine);
  const makers = useMemo(() => {
    const m = new Map<string, typeof meta.turbines>();
    for (const t of meta.turbines) m.set(t.maker, [...(m.get(t.maker) ?? []), t]);
    return [...m.entries()];
  }, [meta.turbines]);
  const e = inp.econ as Record<string, number>;
  const years = Array.from({ length: meta.years[1] - 2000 }, (_, i) => 2001 + i);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setReading(true); setFileMsg(null);
    try {
      if (mode === "mgm") {
        const r = await readMgmZip(f);
        r.series.height = height;
        set({ source: "series", series: r.series, ...(r.lat && r.lon ? { lat: r.lat, lon: r.lon } : {}) });
        setFileMsg({ ok: true, text: `${fmt(r.series.time.length)} saatlik ölçüm okundu${r.station ? `, istasyon ${r.station}` : ""}.` });
      } else {
        const s = await readCsv(f, height);
        set({ source: "series", series: s });
        setFileMsg({ ok: true, text: `${fmt(s.time.length)} satır okundu.` });
      }
    } catch (err) {
      setFileMsg({ ok: false, text: err instanceof Error ? err.message : "Dosya okunamadı." });
    } finally { setReading(false); }
  }

  return (
    <div className="divide-y-0">
      <Step n={1} title="Konum" done>
        <MapPicker lat={inp.lat} lon={inp.lon} onPick={(lat, lon) => set({ lat, lon })} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Enlem" value={inp.lat} step={0.01} onChange={lat => set({ lat })} />
          <NumberField label="Boylam" value={inp.lon} step={0.01} onChange={lon => set({ lon })} />
        </div>
        <p className="text-[0.78rem] text-muted">Haritaya tıklayarak da konum seçebilirsiniz.</p>
      </Step>

      <Step n={2} title="Rüzgar verisi" done={!dataStale}>
        <Segmented label="Veri kaynağı" value={mode} onChange={setMode}
          options={[{ value: "nasa", label: "NASA POWER" }, { value: "mgm", label: "MGM zip" }, { value: "csv", label: "CSV" }]} />
        {mode === "nasa" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label><Label>Başlangıç</Label>
                <select className="field num" value={inp.y1} onChange={ev => set({ y1: Number(ev.target.value) })}>
                  {years.map(y => <option key={y}>{y}</option>)}</select></label>
              <label><Label>Bitiş</Label>
                <select className="field num" value={inp.y2} onChange={ev => set({ y2: Number(ev.target.value) })}>
                  {years.map(y => <option key={y}>{y}</option>)}</select></label>
            </div>
            <button type="button" onClick={onFetchNasa} disabled={busy}
              className={`flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-[0.88rem] font-semibold transition-colors
                ${dataStale ? "bg-brand text-white hover:bg-brand-hover" : "bg-sunken text-ink ring-1 ring-line hover:bg-brand-soft"} disabled:opacity-60`}>
              <ArrowsClockwise size={16} weight="bold" className={busy ? "animate-spin" : ""} />
              {dataStale ? "Bu konumun verisini getir" : "Veriyi yeniden getir"}
            </button>
          </>
        ) : (
          <>
            <NumberField label={mode === "mgm" ? "Anemometre yüksekliği" : "Ölçüm yüksekliği"} unit="m" value={height} onChange={setHeight} min={1} max={200} />
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-sunken px-4 py-5 text-center transition-colors hover:border-brand hover:bg-brand-soft">
              <UploadSimple size={22} className="text-brand" />
              <span className="text-[0.85rem] font-medium text-ink">{reading ? "Okunuyor…" : mode === "mgm" ? "MGM zip dosyasını seçin" : "CSV dosyasını seçin"}</span>
              <span className="text-[0.75rem] text-muted">{mode === "mgm" ? "Zip'i açmanıza gerek yok" : "Zaman ve hız sütunları zorunlu"}</span>
              <input type="file" className="sr-only" accept={mode === "mgm" ? ".zip" : ".csv,.txt"} onChange={ev => onFile(ev.target.files?.[0])} />
            </label>
            {fileMsg && (
              <p className={`flex items-start gap-1.5 text-[0.8rem] ${fileMsg.ok ? "text-brand" : "text-coral"}`}>
                {fileMsg.ok ? <CheckCircle size={16} weight="fill" className="mt-px flex-none" /> : <WarningCircle size={16} weight="fill" className="mt-px flex-none" />}
                {fileMsg.text}
              </p>
            )}
          </>
        )}
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[0.8rem] ${dataStale ? "bg-amber-soft text-amber" : "bg-sunken text-ink-2"}`}>
          {dataStale ? <WarningCircle size={16} weight="fill" className="mt-px flex-none" /> : <CheckCircle size={16} weight="fill" className="mt-px flex-none text-brand" />}
          <span>{dataStale ? "Konum değişti. Sonuçlar hâlâ önceki verinin; yeni konum için veriyi getirin." : <>Kullanılan veri: <b className="font-semibold">{dataLabel}</b></>}</span>
        </div>
      </Step>

      <Step n={3} title="Türbin" done>
        <label className="block"><Label>Model</Label>
          <select className="field" value={inp.turbine} onChange={ev => {
            const t = meta.turbines.find(x => x.type === ev.target.value);
            set({ turbine: ev.target.value, ...(t?.hubs.length && !t.hubs.includes(inp.hub) ? { hub: t.hubs[Math.floor(t.hubs.length / 2)] } : {}) });
          }}>
            {makers.map(([maker, list]) => (
              <optgroup key={maker} label={maker}>
                {list.map(t => <option key={t.type} value={t.type}>{t.type} · {fmt(t.kw / 1000, t.kw % 1000 ? 2 : 1)} MW</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {turbine && <p className="-mt-1.5 text-[0.78rem] text-muted">{turbine.maker} · rotor {turbine.rotor ? fmt(turbine.rotor) + " m" : "–"}</p>}
        <div>
          <Label hint="m">Göbek yüksekliği</Label>
          <div className="flex flex-wrap gap-1.5">
            {(turbine?.hubs.length ? turbine.hubs : [80, 100, 120]).map(h => (
              <button key={h} type="button" onClick={() => set({ hub: h })}
                className={`num h-8 cursor-pointer rounded-md px-2.5 text-[0.8rem] font-medium ring-1 transition-colors
                  ${inp.hub === h ? "bg-brand text-white ring-brand" : "bg-surface text-ink-2 ring-line hover:ring-brand"}`}>{fmt(h, h % 1 ? 1 : 0)}</button>
            ))}
            <input type="number" aria-label="Özel göbek yüksekliği" className="field num h-8 w-20 px-2 text-[0.8rem]" value={inp.hub}
              min={20} max={200} onChange={ev => { const v = Number(ev.target.value); if (v >= 20 && v <= 200) set({ hub: v }); }} />
          </div>
        </div>
        <div>
          <Label>Türbin adedi</Label>
          <div className="flex h-10 w-36 items-center justify-between rounded-lg ring-1 ring-line-strong">
            <button type="button" aria-label="Azalt" className="grid h-10 w-10 cursor-pointer place-items-center text-muted hover:text-ink disabled:opacity-40"
              disabled={inp.n <= 1} onClick={() => set({ n: inp.n - 1 })}><Minus size={14} weight="bold" /></button>
            <span className="num text-[0.95rem] font-semibold">{inp.n}</span>
            <button type="button" aria-label="Artır" className="grid h-10 w-10 cursor-pointer place-items-center text-muted hover:text-ink disabled:opacity-40"
              disabled={inp.n >= 50} onClick={() => set({ n: inp.n + 1 })}><Plus size={14} weight="bold" /></button>
          </div>
        </div>
      </Step>

      <Step n={4} title="Ekonomi" done>
        <Slider label="Yatırım (CAPEX)" unit="USD/kW" value={e.capex_per_kw} min={800} max={2500} step={50} onChange={v => setEcon("capex_per_kw", v)} />
        <Slider label="Teşvik dönemi fiyatı" unit="USD/MWh" value={e.incentive_price} min={30} max={150} step={1} onChange={v => setEcon("incentive_price", v)} />
        <Slider label="Teşvik sonrası fiyat" unit="USD/MWh" value={e.market_price} min={30} max={150} step={1} onChange={v => setEcon("market_price", v)} />
        <Slider label="İskonto oranı" unit="%" decimals={1} value={e.discount_rate * 100} min={3} max={15} step={0.5} onChange={v => setEcon("discount_rate", v / 100)} />
        <More title="Diğer ekonomik varsayımlar">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="OPEX" unit="USD/kW·yıl" value={e.opex_per_kw_year} onChange={v => setEcon("opex_per_kw_year", v)} />
            <NumberField label="OPEX artışı" unit="%/yıl" step={0.5} value={e.opex_escalation * 100} onChange={v => setEcon("opex_escalation", v / 100)} />
            <NumberField label="Teşvik süresi" unit="yıl" value={e.incentive_years} min={0} max={40} onChange={v => setEcon("incentive_years", Math.round(v))} />
            <NumberField label="Fiyat artışı" unit="%/yıl" step={0.5} value={e.price_escalation * 100} onChange={v => setEcon("price_escalation", v / 100)} />
            <NumberField label="Proje ömrü" unit="yıl" value={e.lifetime} min={1} max={40} onChange={v => setEcon("lifetime", Math.round(v))} />
            <NumberField label="Degradasyon" unit="%/yıl" step={0.1} value={e.degradation * 100} onChange={v => setEcon("degradation", v / 100)} />
            <NumberField label="Kurumlar vergisi" unit="%" value={e.tax_rate * 100} onChange={v => setEcon("tax_rate", v / 100)} />
            <NumberField label="AEP belirsizliği σ" unit="%" value={e.aep_sigma * 100} onChange={v => setEcon("aep_sigma", v / 100)} />
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg bg-sunken px-3 py-2.5 ring-1 ring-line">
            <span className="text-[0.85rem] font-medium text-ink-2">Kredi kullan</span>
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={Boolean(inp.econ.loan_enabled)}
              onChange={ev => setEcon("loan_enabled", ev.target.checked)} />
          </label>
          {inp.econ.loan_enabled ? (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <NumberField label="Pay" unit="%" value={e.loan_share * 100} onChange={v => setEcon("loan_share", v / 100)} />
              <NumberField label="Faiz" unit="%" step={0.5} value={e.loan_rate * 100} onChange={v => setEcon("loan_rate", v / 100)} />
              <NumberField label="Vade" unit="yıl" value={e.loan_term} onChange={v => setEcon("loan_term", Math.round(v))} />
            </div>
          ) : null}
        </More>
      </Step>

      <Step n={5} title="Gelişmiş">
        <div>
          <Label>Göbek yüksekliğine taşıma</Label>
          <Segmented label="Ekstrapolasyon yöntemi" value={inp.method} onChange={method => set({ method })}
            options={[{ value: "power", label: "Power law" }, { value: "log", label: "Log law" }]} />
        </div>
        {inp.method === "power" && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="block"><Label>α değeri</Label>
              <select className="field" value={inp.alpha === null ? "site" : "fixed"}
                onChange={ev => set({ alpha: ev.target.value === "site" ? null : 0.143 })}>
                <option value="site">Sahadan hesapla (10 m ve 50 m)</option>
                <option value="fixed">Sabit değer</option>
              </select></label>
            {inp.alpha !== null && (
              <input type="number" aria-label="Sabit α" className="field num w-24" step={0.005} value={inp.alpha}
                onChange={ev => set({ alpha: Number(ev.target.value) })} />
            )}
          </div>
        )}
        <label className="block"><Label hint={`z₀ = ${fmt(meta.z0[inp.z0_name], 4)} m`}>Arazi tipi</Label>
          <select className="field" value={inp.z0_name} onChange={ev => set({ z0_name: ev.target.value })}>
            {Object.keys(meta.z0).map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="block"><Label>Yoğunluk düzeltmesi</Label>
          <select className="field" value={inp.density} onChange={ev => set({ density: ev.target.value as Inputs["density"] })}>
            <option value="iec">IEC 61400-12-1</option><option value="svenningsen">Svenningsen (değişken üs)</option></select></label>
        <More title="Kayıp oranları">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(meta.losses).map(([k, l]) => (
              <NumberField key={k} label={l.label} unit="%" step={0.5} value={(inp.losses[k] ?? l.value) * 100}
                onChange={v => set({ losses: { ...inp.losses, [k]: Math.max(0, Math.min(50, v)) / 100 } })} />
            ))}
          </div>
          <p className="mt-2 text-[0.75rem] text-muted">Tek türbinde iz kaybı uygulanmaz.</p>
        </More>
      </Step>
    </div>
  );
}

function More({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[0.84rem] font-medium text-ink-2 hover:text-ink">
        {title}<CaretDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}
