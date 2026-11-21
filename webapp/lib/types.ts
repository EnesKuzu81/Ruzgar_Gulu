// API sözleşmesi (webapp/api/index.py ile eşleşir)
export type Turbine = { type: string; maker: string; kw: number; rotor: number | null; hubs: number[] };

export type Meta = {
  turbines: Turbine[];
  z0: Record<string, number>;
  losses: Record<string, { value: number; label: string }>;
  econ: Record<string, number | boolean | string>;
  env: { grid_emission_factor: number; household_consumption: number };
  cover: Record<string, string>;
  years: [number, number];
  qualitative: Record<string, { title: string; hint: string }>;
};

export type Series = {
  time: string[]; ws: (number | null)[]; wd?: (number | null)[]; t2m_c?: (number | null)[];
  ps_kpa?: (number | null)[]; label: string; height: number;
};

export type Source = "sample" | "nasa" | "series";

export type Inputs = {
  source: Source; lat: number; lon: number; y1: number; y2: number; series: Series | null;
  turbine: string; hub: number; n: number;
  method: "power" | "log"; alpha: number | null; z0_name: string; density: "iec" | "svenningsen";
  losses: Record<string, number>; econ: Record<string, number | boolean>;
  ef: number; kwh: number; notes: Record<string, string>;
  project: string; author: string; cover: Record<string, string>;
};

export type Result = {
  site: { lat: number; lon: number; label: string; is_nasa: boolean; h1: number };
  quality: { total_records: number; expected_records: number; missing_pct: number; duplicates_removed: number;
             out_of_range_removed: number; start: string; end: string };
  stats: { mean: number; median: number; std: number; max: number; calm_pct: number };
  rho: number; rho_is_standard: boolean; pd_ref: number; pd_hub: number;
  wind_class: { class: number; name: string; table_height: number };
  ws_hub_mean: number;
  weibull: { mle: { k: number; c: number }; mom: { k: number; c: number }; pd_mle: number; pd_mom: number };
  hist: { centers: number[]; density: number[]; x: number[]; fits: Record<string, number[]> };
  rose: { sector: string[]; freq: number[]; mean: number[] } | null;
  monthly: number[]; diurnal: number[];
  yearly: { years: number[]; values: number[]; cov: number };
  alpha: number | null;
  compare: { alpha: number; z0: number; power_mean: number; log_mean: number; diff_pct: number } | null;
  energy: {
    turbine: string; rated_kw: number; rotor_d: number | null; hub: number; n: number; capacity_mw: number;
    gross: number; gross_weibull: number; diff_pct: number; net: number; cf: number; flh: number; loss_pct: number;
    losses: { key: string; label: string; rate: number; mwh: number }[];
    monthly_net: number[];
    curve_std: { v: number[]; p: number[] }; curve_site: { v: number[]; p: number[] };
    weibull_hub: { k: number; c: number };
  };
  env: { emission_factor: number; annual_co2_t: number; lifetime_co2_t: number; households: number; household_kwh: number };
  econ: null | {
    capex: number; breakdown: Record<string, number>; lcoe: number; npv: number; irr: number | null;
    payback: number | null; dpayback: number | null; ok: boolean; verdict: string; currency: string;
    discount_rate: number; lifetime: number;
    table: { year: number[]; energy: number[]; revenue: number[]; opex: number[]; tax: number[]; net: number[]; cum: number[]; price: number[] };
    tornado: { label: string; lo: number; hi: number }[];
    scenarios: { name: string; p: string; aep: number; npv: number; irr: number | null; lcoe: number }[];
  };
  econ_error: string | null;
};
