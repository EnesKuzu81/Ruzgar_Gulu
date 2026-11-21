// ECharts seçenekleri: tek görsel dil (ince ızgara, sade eksenler, Türkçe sayı biçimi).
import type { EChartsOption } from "echarts";
import { C, MONTHS, fmt } from "./format";
import type { Result } from "./types";

const font = { fontFamily: "var(--font-geist), system-ui, sans-serif" };
const axisLabel = { color: C.muted, fontSize: 11, ...font };
const nameStyle = { color: C.faint, fontSize: 11, ...font };
const tooltip = {
  backgroundColor: "#0e1714", borderWidth: 0, padding: [8, 10] as [number, number],
  textStyle: { color: "#fff", fontSize: 12, ...font }, extraCssText: "border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18)",
};
const val = (name = "", extra: object = {}) => ({
  type: "value" as const, name, nameTextStyle: nameStyle, nameGap: 10, axisLabel,
  splitLine: { lineStyle: { color: C.grid } }, axisLine: { show: false }, axisTick: { show: false }, ...extra,
});
const cat = (data: (string | number)[], extra: object = {}) => ({
  type: "category" as const, data, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, ...extra,
});
const legend = { top: 0, right: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: C.muted, fontSize: 11, ...font } };
const grid = (o: object = {}) => ({ left: 8, right: 12, top: 34, bottom: 4, containLabel: true, ...o });

export function weibull(r: Result): EChartsOption {
  const w = r.hist.centers.map((x, i) => [x, r.hist.density[i]]);
  const line = (k: string) => r.hist.x.map((x, i) => [x, r.hist.fits[k][i]]);
  return {
    animationDuration: 500, tooltip: { ...tooltip, trigger: "axis", valueFormatter: v => fmt(v as number, 3) }, legend, grid: grid(),
    xAxis: val("m/s", { max: Math.ceil(Math.max(...r.hist.centers) + 1), splitLine: { show: false } }),
    yAxis: val("olasılık"),
    series: [
      { name: "Ölçülen", type: "bar", data: w, barWidth: "92%", itemStyle: { color: "rgba(11,107,79,.16)", borderRadius: [3, 3, 0, 0] } },
      { name: "MLE", type: "line", data: line("MLE"), showSymbol: false, smooth: true, lineStyle: { color: C.brand, width: 2.5 }, itemStyle: { color: C.brand } },
      { name: "Momentler", type: "line", data: line("Momentler"), showSymbol: false, smooth: true, lineStyle: { color: C.amber, width: 1.5, type: "dashed" }, itemStyle: { color: C.amber } },
    ],
  };
}

export function rose(r: Result): EChartsOption {
  const rs = r.rose!;
  const top = Math.max(...rs.freq);
  return {
    animationDuration: 500,
    tooltip: { ...tooltip, formatter: (p: any) => `${p.name}<br/>%${fmt(p.value, 1)} · ort. ${fmt(rs.mean[p.dataIndex], 2)} m/s` },
    polar: { radius: ["8%", "78%"] },
    angleAxis: { type: "category", data: rs.sector, startAngle: 90 + 360 / 32, clockwise: true, axisLabel: { ...axisLabel, fontSize: 10 },
                 axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: C.grid } } },
    radiusAxis: { axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: C.grid } } },
    series: [{ type: "bar", coordinateSystem: "polar", data: rs.freq.map(f => ({ value: f, itemStyle: { color: f === top ? C.brand : C.brandMid } })),
               barCategoryGap: "6%", itemStyle: { borderRadius: 2 } }],
  };
}

export function monthlyBars(values: number[], unit: string, decimals = 1): EChartsOption {
  const max = Math.max(...values);
  return {
    animationDuration: 500, tooltip: { ...tooltip, trigger: "axis", valueFormatter: v => `${fmt(v as number, decimals)} ${unit}` },
    grid: grid({ top: 20 }), xAxis: cat(MONTHS), yAxis: val(unit),
    series: [{ type: "bar", data: values.map(v => ({ value: v, itemStyle: { color: v === max ? C.amber : C.brandMid, borderRadius: [4, 4, 0, 0] } })), barWidth: "58%" }],
  };
}

export function diurnal(r: Result): EChartsOption {
  return {
    animationDuration: 500, tooltip: { ...tooltip, trigger: "axis", valueFormatter: v => `${fmt(v as number, 2)} m/s` },
    grid: grid({ top: 20 }), xAxis: cat([...Array(24).keys()].map(h => `${h}:00`), { boundaryGap: false, axisLabel: { ...axisLabel, interval: 3 } }),
    yAxis: val("m/s", { scale: true }),
    series: [{ type: "line", data: r.diurnal, smooth: true, showSymbol: false, lineStyle: { color: C.sky, width: 2.5 },
               areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(46,123,191,.22)" }, { offset: 1, color: "rgba(46,123,191,0)" }] } } }],
  };
}

export function powerCurve(r: Result): EChartsOption {
  const pts = (c: { v: number[]; p: number[] }) => c.v.map((v, i) => [v, c.p[i]]);
  return {
    animationDuration: 500, tooltip: { ...tooltip, trigger: "axis", valueFormatter: v => `${fmt(v as number, 0)} kW` }, legend, grid: grid(),
    xAxis: val("m/s", { splitLine: { show: false } }), yAxis: val("kW"),
    series: [
      { name: "Standart (ρ₀ = 1,225)", type: "line", data: pts(r.energy.curve_std), showSymbol: false, lineStyle: { color: C.faint, width: 1.5, type: "dashed" }, itemStyle: { color: C.faint } },
      { name: `Saha (ρ = ${fmt(r.rho, 3)})`, type: "line", data: pts(r.energy.curve_site), showSymbol: false, lineStyle: { color: C.brand, width: 2.5 }, itemStyle: { color: C.brand },
        areaStyle: { color: "rgba(11,107,79,.06)" } },
    ],
  };
}

export function waterfall(r: Result): EChartsOption {
  const L = r.energy.losses.filter(l => l.rate > 0);
  const labels = ["Brüt", ...L.map(l => l.label), "Net"];
  let level = r.energy.gross;
  const base: number[] = [0], body: any[] = [{ value: r.energy.gross, itemStyle: { color: C.brand } }];
  for (const l of L) { level -= l.mwh; base.push(level); body.push({ value: l.mwh, itemStyle: { color: C.coral } }); }
  base.push(0); body.push({ value: r.energy.net, itemStyle: { color: C.brand } });
  const lo = Math.floor((r.energy.net * 0.86) / 100) * 100;
  return {
    animationDuration: 500,
    tooltip: { ...tooltip, trigger: "axis", formatter: (p: any) => { const b = p.find((x: any) => x.seriesName === "v"); return `${b.name}<br/>${fmt(b.data.raw, 0)} MWh`; } },
    grid: grid({ top: 20 }), xAxis: cat(labels, { axisLabel: { ...axisLabel, interval: 0, rotate: labels.length > 6 ? 25 : 0 } }), yAxis: val("MWh/yıl", { min: lo }),
    series: [
      { name: "b", type: "bar", stack: "w", data: base.map((b, i) => (i === 0 || i === base.length - 1 ? lo : b)), itemStyle: { color: "transparent" }, silent: true },
      { name: "v", type: "bar", stack: "w", barWidth: "52%", itemStyle: { borderRadius: 3 },
        data: body.map((d, i) => ({ ...d, raw: d.value, value: i === 0 || i === body.length - 1 ? d.value - lo : d.value })) },
    ],
  };
}

export function cashflow(r: Result): EChartsOption {
  const t = r.econ!.table;
  return {
    animationDuration: 500, tooltip: { ...tooltip, trigger: "axis", valueFormatter: v => `${fmt((v as number) / 1e6, 2)} M ${r.econ!.currency}` },
    legend, grid: grid(), xAxis: cat(t.year), yAxis: val(`M ${r.econ!.currency}`, { axisLabel: { ...axisLabel, formatter: (v: number) => fmt(v / 1e6, 1) } }),
    series: [
      { name: "Yıllık", type: "bar", data: t.net.map(v => ({ value: v, itemStyle: { color: v < 0 ? C.coral : "rgba(11,107,79,.35)", borderRadius: v < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0] } })), barWidth: "60%" },
      { name: "Kümülatif", type: "line", data: t.cum, showSymbol: false, smooth: true, lineStyle: { color: C.brand, width: 2.5 }, itemStyle: { color: C.brand },
        markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: C.faint, type: "solid", width: 1 }, label: { show: false } } },
    ],
  };
}

export function sparkCum(r: Result): EChartsOption {
  const t = r.econ!.table;
  return {
    animation: false, grid: { left: 0, right: 0, top: 6, bottom: 0 },
    xAxis: { type: "category", data: t.year, show: false, boundaryGap: false }, yAxis: { type: "value", show: false },
    series: [{ type: "line", data: t.cum, showSymbol: false, smooth: true,
               lineStyle: { width: 2, color: t.cum[t.cum.length - 1] < 0 ? C.coral : C.brand },
               areaStyle: { color: t.cum[t.cum.length - 1] < 0 ? "rgba(194,65,63,.10)" : "rgba(11,107,79,.10)", origin: 0 },
               markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: C.faint, type: "dashed", width: 1 }, label: { show: false } } }],
  };
}

export function tornado(r: Result): EChartsOption {
  const rows = [...r.econ!.tornado].sort((a, b) => Math.abs(a.hi - a.lo) - Math.abs(b.hi - b.lo));
  const cur = r.econ!.currency;
  return {
    animationDuration: 500, tooltip: { ...tooltip, trigger: "axis", valueFormatter: v => `${fmt((v as number) / 1e6, 2)} M ${cur}` }, legend,
    grid: grid({ left: 4 }), yAxis: cat(rows.map(x => x.label), { axisLine: { show: false } }),
    xAxis: val(`NPV değişimi (M ${cur})`, { axisLabel: { ...axisLabel, formatter: (v: number) => fmt(v / 1e6, 1) }, nameLocation: "middle", nameGap: 26 }),
    series: [
      { name: "−%20", type: "bar", stack: "t", data: rows.map(x => x.lo), itemStyle: { color: C.coral, borderRadius: 3 }, barWidth: "56%" },
      { name: "+%20", type: "bar", stack: "t2", barGap: "-100%", data: rows.map(x => x.hi), itemStyle: { color: C.brand, borderRadius: 3 }, barWidth: "56%" },
    ],
  };
}
