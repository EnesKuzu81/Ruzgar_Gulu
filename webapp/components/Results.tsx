"use client";
// Sağ alan: karar kartı, ana göstergeler, bölümler (rüzgar kaynağı, enerji, ekonomi, çevre ve rapor).
import { useState } from "react";
import { CheckCircle, FileArrowDown, Gauge, Leaf, Lightning, SpinnerGap, Wind, XCircle } from "@phosphor-icons/react";
import Chart from "./Chart";
import { Badge, Card, Table } from "./ui";
import * as ch from "@/lib/charts";
import { fmt, money, pct } from "@/lib/format";
import type { Inputs, Meta, Result } from "@/lib/types";

type Tab = "kaynak" | "enerji" | "ekonomi" | "cevre";
const TABS: { id: Tab; label: string }[] = [
  { id: "kaynak", label: "Rüzgar kaynağı" }, { id: "enerji", label: "Enerji üretimi" },
  { id: "ekonomi", label: "Ekonomi" }, { id: "cevre", label: "Çevre ve rapor" },
];

type Props = { r: Result; inp: Inputs; meta: Meta; set: (p: Partial<Inputs>) => void; onReport: () => void; reporting: boolean };

export default function Results({ r, inp, meta, set, onReport, reporting }: Props) {
  const [tab, setTab] = useState<Tab>("kaynak");
  const c = r.econ, cur = c?.currency ?? "USD";
  return (
    <div className="space-y-5">
      <Hero r={r} project={inp.project} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={<Wind size={18} weight="duotone" />} label={`Ortalama hız (${fmt(r.energy.hub)} m)`} value={fmt(r.ws_hub_mean, 2)} unit="m/s"
          note={`Weibull k ${fmt(r.energy.weibull_hub.k, 2)} · c ${fmt(r.energy.weibull_hub.c, 2)} m/s`} />
        <Kpi icon={<Gauge size={18} weight="duotone" />} label="Güç yoğunluğu" value={fmt(r.pd_hub)} unit="W/m²"
          note={`NREL sınıf ${r.wind_class.class} · ${r.wind_class.name} (${fmt(r.site.h1)} m)`} />
        <Kpi icon={<Lightning size={18} weight="duotone" />} label="Net yıllık üretim" value={fmt(r.energy.net)} unit="MWh" tone="amber"
          note={`Brüt ${fmt(r.energy.gross)} MWh · kayıp ${pct(r.energy.loss_pct / 100)}`} />
        <Kpi icon={<Leaf size={18} weight="duotone" />} label="Kapasite faktörü" value={pct(r.energy.cf)} unit=""
          note={`${fmt(r.energy.flh)} tam yük saati · ${fmt(r.energy.capacity_mw, 2)} MW`} />
      </div>

      <nav role="tablist" aria-label="Sonuç bölümleri" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3.5 pb-2.5 pt-1 text-[0.9rem] font-medium transition-colors
              ${tab === t.id ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</button>
        ))}
      </nav>

      <div key={tab} className="rise space-y-5">
        {tab === "kaynak" && <Kaynak r={r} />}
        {tab === "enerji" && <Enerji r={r} />}
        {tab === "ekonomi" && (c ? <Ekonomi r={r} cur={cur} /> :
          <Card><p className="text-[0.9rem] text-coral">Ekonomik hesap yapılamadı: {r.econ_error}</p></Card>)}
        {tab === "cevre" && <Cevre r={r} inp={inp} meta={meta} set={set} onReport={onReport} reporting={reporting} />}
      </div>
    </div>
  );
}

function Hero({ r, project }: { r: Result; project: string }) {
  const c = r.econ;
  const ok = c?.ok ?? false;
  return (
    <section className="grid gap-6 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {c ? <Badge tone={ok ? "ok" : "no"}>{ok ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} weight="fill" />}{ok ? "Fizibil" : "Fizibil değil"}</Badge>
             : <Badge tone="neutral">Ekonomi hesaplanamadı</Badge>}
          <span className="text-[0.8rem] text-muted">{r.site.label} · {fmt(r.site.lat, 4)} K, {fmt(r.site.lon, 4)} D</span>
        </div>
        <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight text-ink">{project || "Adsız proje"}</h1>
        {c && <p className="mt-1.5 max-w-[62ch] text-[0.92rem] text-ink-2">{c.verdict}</p>}
        {c && (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
            <Metric label="Net bugünkü değer" value={fmt(c.npv / 1e6, 2)} unit={`M ${c.currency}`} tone={c.npv < 0 ? "no" : "ok"} />
            <Metric label="İç verim oranı" value={c.irr === null ? "–" : pct(c.irr)} unit={`hedef ${pct(c.discount_rate, 0)}`} />
            <Metric label="LCOE" value={fmt(c.lcoe, 1)} unit={`${c.currency}/MWh`} />
            <Metric label="Geri ödeme" value={c.payback === null ? "yok" : fmt(c.payback, 1)} unit={c.payback === null ? "ömür içinde" : "yıl"} />
          </dl>
        )}
      </div>
      {c && (
        <div className="flex flex-col justify-between rounded-xl bg-sunken p-4 ring-1 ring-line">
          <div>
            <p className="text-[0.8rem] font-medium text-ink-2">Kümülatif nakit akışı</p>
            <p className="text-[0.75rem] text-muted">{c.lifetime} yıl, {money(c.capex, c.currency)} yatırım</p>
          </div>
          <Chart option={ch.sparkCum(r)} height={110} label="Kümülatif nakit akışı" />
          <p className="text-[0.78rem] text-muted">
            Proje sonunda <b className={`num ${c.table.cum.at(-1)! < 0 ? "text-coral" : "text-brand"}`}>{money(c.table.cum.at(-1)!, c.currency)}</b>
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: "ok" | "no" }) {
  return (
    <div>
      <dt className="text-[0.78rem] text-muted">{label}</dt>
      <dd className={`num mt-1 text-[1.75rem] font-semibold leading-none ${tone === "no" ? "text-coral" : tone === "ok" ? "text-brand" : "text-ink"}`}>{value}</dd>
      <dd className="mt-1 text-[0.75rem] text-faint">{unit}</dd>
    </div>
  );
}

function Kpi({ icon, label, value, unit, note, tone }: { icon: React.ReactNode; label: string; value: string; unit: string; note: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-[0.8rem] text-muted">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone === "amber" ? "bg-amber-soft text-amber" : "bg-brand-soft text-brand"}`}>{icon}</span>
        {label}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5"><span className="num text-[1.6rem] font-semibold leading-none text-ink">{value}</span>
        <span className="text-[0.8rem] text-muted">{unit}</span></p>
      <p className="mt-2 text-[0.75rem] text-faint">{note}</p>
    </div>
  );
}

function Kaynak({ r }: { r: Result }) {
  const top = r.rose ? r.rose.sector[r.rose.freq.indexOf(Math.max(...r.rose.freq))] : null;
  const q = r.quality;
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title={`Hız dağılımı ve Weibull uyumu (${fmt(r.site.h1)} m)`} note={`MLE: k = ${fmt(r.weibull.mle.k, 2)}, c = ${fmt(r.weibull.mle.c, 2)} m/s · momentler: k = ${fmt(r.weibull.mom.k, 2)}, c = ${fmt(r.weibull.mom.c, 2)} m/s`}>
          <Chart option={ch.weibull(r)} height={300} label="Hız histogramı ve Weibull eğrileri" />
        </Card>
        <Card title="Rüzgar gülü" note={top ? `Baskın yön ${top}, ${fmt(Math.max(...r.rose!.freq), 1)} % saat` : "Veride yön bilgisi yok"}>
          {r.rose ? <Chart option={ch.rose(r)} height={300} label="Rüzgar gülü" /> : <p className="py-16 text-center text-[0.85rem] text-muted">Yön verisi olmadığı için çizilemedi.</p>}
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Aylık ortalama hız" note="En rüzgarlı ay vurgulanmıştır">
          <Chart option={ch.monthlyBars(r.monthly, "m/s", 2)} height={240} label="Aylık ortalama hız" />
        </Card>
        <Card title="Günlük profil" note="Yerel saate göre ortalama hız">
          <Chart option={ch.diurnal(r)} height={240} label="Günlük rüzgar profili" />
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Weibull parametreleri">
          <Table head={["Yöntem", "k", "c (m/s)", "P/A (W/m²)"]} align={["l", "r", "r", "r"]} rows={[
            ["Maximum Likelihood", fmt(r.weibull.mle.k, 2), fmt(r.weibull.mle.c, 2), fmt(r.weibull.pd_mle)],
            ["Momentler", fmt(r.weibull.mom.k, 2), fmt(r.weibull.mom.c, 2), fmt(r.weibull.pd_mom)],
            ["Zaman serisi, ½ρv³", "–", "–", fmt(r.pd_ref)],
          ]} />
        </Card>
        <Card title={`${fmt(r.energy.hub)} m yüksekliğe taşıma`}>
          {r.compare ? (
            <Table head={["Yöntem", "Ortalama hız"]} align={["l", "r"]} rows={[
              [`Power law (α = ${fmt(r.compare.alpha, 3)})`, `${fmt(r.compare.power_mean, 2)} m/s`],
              [`Log law (z₀ = ${fmt(r.compare.z0, 3)} m)`, `${fmt(r.compare.log_mean, 2)} m/s`],
              ["Fark", pct(Math.abs(r.compare.diff_pct) / 100)],
            ]} />
          ) : <p className="text-[0.85rem] text-ink-2">Ölçüm tek yükseklikte; göbek hızı {fmt(r.ws_hub_mean, 2)} m/s.</p>}
        </Card>
        <Card title="Veri kalitesi">
          <Table head={["Ölçüt", "Değer"]} align={["l", "r"]} rows={[
            ["Dönem", `${q.start.slice(0, 4)} – ${q.end.slice(0, 4)}`],
            ["Kayıt", fmt(q.total_records)],
            ["Eksik veri", pct(q.missing_pct / 100, 2)],
            ["Hava yoğunluğu", `${fmt(r.rho, 3)} kg/m³`],
            ["Yıllar arası değişkenlik", pct(r.yearly.cov / 100)],
          ]} />
        </Card>
      </div>
    </>
  );
}

function Enerji({ r }: { r: Result }) {
  const e = r.energy;
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={`Güç eğrisi: ${e.turbine}`} note={`${fmt(e.rated_kw)} kW · rotor ${e.rotor_d ? fmt(e.rotor_d) + " m" : "–"} · göbek ${fmt(e.hub)} m`}>
          <Chart option={ch.powerCurve(r)} height={280} label="Türbin güç eğrisi" />
        </Card>
        <Card title="Brüttan nete kayıplar" note={`Çarpımsal toplam kayıp ${pct(e.loss_pct / 100)}`}>
          <Chart option={ch.waterfall(r)} height={280} label="Kayıp şelalesi" />
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Aylık net üretim" note="Yıllar üzerinden ortalama, en yüksek ay vurgulanmıştır">
          <Chart option={ch.monthlyBars(e.monthly_net, "MWh", 0)} height={260} label="Aylık net üretim" />
        </Card>
        <Card title="Üretim özeti">
          <Table head={["Gösterge", "Değer"]} align={["l", "r"]} rows={[
            ["Brüt AEP, zaman serisi", `${fmt(e.gross)} MWh`],
            ["Brüt AEP, Weibull", `${fmt(e.gross_weibull)} MWh`],
            ["Yöntem farkı", pct(Math.abs(e.diff_pct) / 100)],
            ["Net AEP", `${fmt(e.net)} MWh`],
            ["Kapasite faktörü", pct(e.cf)],
            ["Tam yük saati", `${fmt(e.flh)} h`],
            ["Kurulu güç", `${fmt(e.capacity_mw, 2)} MW (${e.n} türbin)`],
          ]} />
        </Card>
      </div>
    </>
  );
}

function Ekonomi({ r, cur }: { r: Result; cur: string }) {
  const c = r.econ!;
  const t = c.table;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Small label="Yatırım" value={money(c.capex, cur)} />
        <Small label="1. yıl geliri" value={money(t.revenue[1], cur)} />
        <Small label="1. yıl işletme gideri" value={money(t.opex[1], cur)} />
        <Small label="İskontolu geri ödeme" value={c.dpayback === null ? "ömür içinde yok" : `${fmt(c.dpayback, 1)} yıl`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Yıllık ve kümülatif nakit akışı" note="Vergi ve teşvik dönemi dahil">
          <Chart option={ch.cashflow(r)} height={290} label="Nakit akışı" />
        </Card>
        <Card title="NPV duyarlılığı" note="Her parametre tek başına ±%20 değiştirildiğinde">
          <Chart option={ch.tornado(r)} height={290} label="Duyarlılık analizi" />
        </Card>
      </div>
      <Card title="Senaryolar" note="AEP belirsizliğine göre: P90 = P50·(1 − 1,282σ), P10 = P50·(1 + 1,282σ)">
        <Table head={["Senaryo", "AEP", "Net üretim", "NPV", "IRR", "LCOE"]} align={["l", "l", "r", "r", "r", "r"]}
          rows={c.scenarios.map(s => [s.name, s.p, `${fmt(s.aep)} MWh`,
            <span key="n" className={s.npv < 0 ? "text-coral" : "text-brand"}>{fmt(s.npv / 1e6, 2)} M</span>,
            s.irr === null ? "–" : pct(s.irr), `${fmt(s.lcoe, 1)} ${cur}/MWh`])} />
      </Card>
      <details className="group rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <summary className="cursor-pointer list-none px-5 py-4 text-[0.92rem] font-semibold text-ink">Yıllık nakit akış tablosu</summary>
        <div className="max-h-[420px] overflow-auto px-5 pb-5">
          <Table head={["Yıl", "Üretim (MWh)", "Fiyat", "Gelir", "OPEX", "Vergi", "Net", "Kümülatif"]} align={["l", "r", "r", "r", "r", "r", "r", "r"]}
            rows={t.year.map((y, i) => [y, fmt(t.energy[i]), fmt(t.price[i], 1), fmt(t.revenue[i] / 1e3), fmt(t.opex[i] / 1e3),
              fmt(t.tax[i] / 1e3), fmt(t.net[i] / 1e3), fmt(t.cum[i] / 1e3)])} />
          <p className="mt-2 text-[0.75rem] text-muted">Parasal değerler bin {cur}.</p>
        </div>
      </details>
    </>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-[var(--shadow-card)]">
      <p className="text-[0.78rem] text-muted">{label}</p>
      <p className="num mt-1.5 text-[1.15rem] font-semibold text-ink">{value}</p>
    </div>
  );
}

function Cevre({ r, inp, meta, set, onReport, reporting }: Omit<Props, "r"> & { r: Result }) {
  const ev = r.env;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Small label="Yıllık önlenen CO₂" value={`${fmt(ev.annual_co2_t)} t`} />
        <Small label={`${r.econ?.lifetime ?? 25} yılda önlenen CO₂`} value={`${fmt(ev.lifetime_co2_t)} t`} />
        <Small label="Elektriği karşılanan hane" value={`≈ ${fmt(ev.households)}`} />
      </div>
      <p className="-mt-2 text-[0.78rem] text-muted">Şebeke emisyon faktörü {fmt(ev.emission_factor, 3)} tCO₂/MWh (ETKB 2022), hane tüketimi {fmt(ev.household_kwh)} kWh/yıl.</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Nitel değerlendirme" note="Bu metinler rapora olduğu gibi girer; boş başlıklar 'değerlendirilmedi' olarak yazılır">
          <div className="space-y-3">
            {Object.entries(meta.qualitative).map(([k, q]) => (
              <label key={k} className="block">
                <span className="mb-1.5 block text-[0.8rem] font-medium text-ink-2">{q.title}</span>
                <textarea className="field h-20 resize-y py-2 leading-snug" placeholder={q.hint} value={inp.notes[k] ?? ""}
                  onChange={ev2 => set({ notes: { ...inp.notes, [k]: ev2.target.value } })} />
              </label>
            ))}
          </div>
        </Card>
        <Card title="Fizibilite raporu" note="Kapak, 10 bölüm, grafikler, varsayımlar ve kaynakça içeren Word dosyası">
          <div className="space-y-3">
            {([["author", "Hazırlayan"], ["instructor", "Öğretim üyesi"], ["student_no", "Öğrenci no"]] as const).map(([k, l]) => (
              <label key={k} className="block"><span className="mb-1.5 block text-[0.8rem] font-medium text-ink-2">{l}</span>
                <input className="field" value={k === "author" ? inp.author : inp.cover[k] ?? ""}
                  onChange={ev2 => k === "author" ? set({ author: ev2.target.value }) : set({ cover: { ...inp.cover, [k]: ev2.target.value } })} />
              </label>
            ))}
            <p className="text-[0.78rem] text-muted">{meta.cover.university} · {meta.cover.department}</p>
            <button type="button" onClick={onReport} disabled={reporting}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand text-[0.92rem] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-70">
              {reporting ? <SpinnerGap size={18} className="animate-spin" /> : <FileArrowDown size={18} weight="bold" />}
              {reporting ? "Rapor hazırlanıyor, 30 sn kadar sürebilir" : "Word raporunu indir"}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
