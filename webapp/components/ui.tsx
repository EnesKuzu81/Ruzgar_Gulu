"use client";
// Ortak arayüz parçaları: kart, adım başlığı, bölümlü seçici, kaydırıcı, sayı kutusu, rozet.
import type { ReactNode } from "react";
import { fmt } from "@/lib/format";

export function Card({ title, note, action, children, className = "" }:
  { title?: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            {title && <h3 className="text-[0.95rem] font-semibold text-ink">{title}</h3>}
            {note && <p className="mt-0.5 text-[0.8rem] text-muted">{note}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

export function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-5 last:border-b-0">
      <h2 className="mb-3.5 flex items-center gap-2.5 text-[0.92rem] font-semibold text-ink">
        <span className={`grid h-6 w-6 place-items-center rounded-full text-[0.75rem] font-semibold num
          ${done ? "bg-brand text-white" : "bg-brand-soft text-brand"}`}>{n}</span>
        {title}
      </h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.8rem]">
      <span className="font-medium text-ink-2">{children}</span>
      {hint && <span className="text-faint">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }:
  { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-lg bg-sunken p-1 ring-1 ring-line"
         style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`h-8 rounded-md text-[0.8rem] font-medium transition-colors duration-150 cursor-pointer
            ${value === o.value ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-line" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step, unit, decimals = 0, onChange }:
  { label: string; value: number; min: number; max: number; step: number; unit: string; decimals?: number; onChange: (v: number) => void }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <Label hint={<span className="num text-[0.85rem] font-medium text-ink">{fmt(value, decimals)} <span className="text-faint">{unit}</span></span>}>{label}</Label>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        style={{ ["--p" as string]: `${p}%` }} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

export function NumberField({ label, value, onChange, step = 1, min, max, unit }:
  { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) {
  return (
    <label className="block">
      <Label hint={unit}>{label}</Label>
      <input type="number" className="field num" value={Number.isFinite(value) ? value : ""} step={step} min={min} max={max}
        onChange={e => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) onChange(v); }} />
    </label>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "no" | "neutral"; children: ReactNode }) {
  const cls = tone === "ok" ? "bg-brand-soft text-brand" : tone === "no" ? "bg-coral-soft text-coral" : "bg-sunken text-muted ring-1 ring-line";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-semibold ${cls}`}>{children}</span>;
}

export function Table({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align?: ("l" | "r")[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.84rem]">
        <thead>
          <tr className="border-b border-line text-left text-[0.75rem] text-muted">
            {head.map((h, i) => <th key={i} className={`pb-2 font-medium ${align?.[i] === "r" ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0">
              {r.map((c, j) => <td key={j} className={`py-2 ${align?.[j] === "r" ? "text-right num" : "text-ink-2"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
