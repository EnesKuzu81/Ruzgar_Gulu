"""Rüzgar Fizibilite web API'si (FastAPI, Vercel Python fonksiyonu).

Hesapların hepsi core/ modüllerinde; burası yalnızca girdiyi okur, analizi çalıştırır ve sonucu JSON'a çevirir.
Yerelde: uvicorn api.index:app --port 8765 (webapp klasöründen)
"""
from __future__ import annotations

import datetime as dt
import io
import math
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Literal

os.environ.setdefault("MPLCONFIGDIR", tempfile.gettempdir())   # sunucusuz ortamda yazılabilir klasör

HERE = Path(__file__).resolve().parent
LIB = HERE / "_lib" if (HERE / "_lib" / "core").exists() else HERE.parents[1]   # deploy: _lib, yerel: repo kökü
sys.path.insert(0, str(LIB))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from core import economics as ec  # noqa: E402
from core import energy as en  # noqa: E402
from core import environment as env  # noqa: E402
from core import wind_resource as wr  # noqa: E402
from core.analysis import AnalysisInputs, AnalysisResult, run_analysis  # noqa: E402
from core.config import load_defaults  # noqa: E402
from core.data_sources import _request_json, build_power_url, clean_wind_data, default_year_range, parse_power_json  # noqa: E402

app = FastAPI(title="Rüzgar Fizibilite API")
SAMPLE = HERE / "sample_izmir.csv.gz"
_power_cache: dict[tuple, pd.DataFrame] = {}


# ---------------------------------------------------------------- yardımcılar
def clean(obj: Any) -> Any:
    """numpy/pandas değerlerini JSON'a uygun hale getirir (NaN -> None)."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.ndarray, pd.Series, pd.Index)):
        return [clean(v) for v in obj.tolist()]
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (pd.Timestamp, dt.date)):
        return obj.isoformat()
    return obj


def fetch_power(lat: float, lon: float, y1: int, y2: int) -> pd.DataFrame:
    """NASA POWER saatlik verisi; yıllar paralel çekilir, süreç içinde bellekte önbelleklenir."""
    def one(year: int) -> pd.DataFrame:
        key = (round(lat, 4), round(lon, 4), year)
        if key not in _power_cache:
            _power_cache[key] = parse_power_json(_request_json(build_power_url(lat, lon, f"{year}0101", f"{year}1231")))
        return _power_cache[key]

    with ThreadPoolExecutor(max_workers=5) as pool:
        frames = list(pool.map(one, range(y1, y2 + 1)))
    return pd.concat(frames).sort_index()


def load_sample() -> pd.DataFrame:
    df = pd.read_csv(SAMPLE, index_col=0, parse_dates=True)
    df.index = pd.DatetimeIndex(df.index, name="time")
    return df


# ---------------------------------------------------------------- istek modeli
class Series(BaseModel):
    """Tarayıcıda okunan ölçüm verisi (MGM zip ya da CSV). Zaman ISO, UTC."""
    time: list[str]
    ws: list[float | None]
    wd: list[float | None] | None = None
    t2m_c: list[float | None] | None = None
    ps_kpa: list[float | None] | None = None
    label: str = "ölçüm"
    height: float = 10.0


class AnalyzeRequest(BaseModel):
    source: Literal["sample", "nasa", "series"] = "sample"
    lat: float = 38.42
    lon: float = 27.14
    y1: int | None = None
    y2: int | None = None
    series: Series | None = None
    turbine: str = "E-82/2300"
    hub: float = 98
    n: int = Field(1, ge=1, le=50)
    method: Literal["power", "log"] = "power"
    alpha: float | None = None
    z0_name: str = "Nadas tarlası"
    density: Literal["iec", "svenningsen"] = "iec"
    losses: dict[str, float] | None = None
    econ: dict[str, Any] = {}
    ef: float | None = None
    kwh: float | None = None
    notes: dict[str, str] = {}
    project: str = "İzmir Rüzgar Sahası"
    author: str = ""
    cover: dict[str, str] = {}


# ---------------------------------------------------------------- analiz
def build_inputs(req: AnalyzeRequest) -> AnalysisInputs:
    cfg = load_defaults()
    z0_table = cfg["wind_resource"]["roughness_z0"]["value"]
    if req.z0_name not in z0_table:
        raise HTTPException(400, "Bilinmeyen arazi tipi.")
    if req.source == "series":
        s = req.series
        if s is None or not s.time:
            raise HTTPException(400, "Ölçüm verisi boş.")
        raw = pd.DataFrame({"ws": s.ws}, index=pd.DatetimeIndex(pd.to_datetime(s.time, utc=True), name="time"))
        for col in ("wd", "t2m_c", "ps_kpa"):
            vals = getattr(s, col)
            if vals:
                raw[col] = pd.to_numeric(pd.Series(vals), errors="coerce").to_numpy()
        raw["ws"] = pd.to_numeric(raw["ws"], errors="coerce")
        kw = dict(is_nasa=False, h1=s.height, ws_col="ws", wd_col="wd" if "wd" in raw else None)
        label = s.label
    else:
        if req.source == "sample":
            raw = load_sample()
            y1, y2 = 2021, 2025
        else:
            d1, d2 = default_year_range()
            y1, y2 = req.y1 or d1, req.y2 or d2
            if y1 > y2:
                raise HTTPException(400, "Başlangıç yılı bitiş yılından büyük olamaz.")
            try:
                raw = fetch_power(req.lat, req.lon, y1, y2)
            except Exception as e:
                raise HTTPException(502, f"NASA POWER verisi alınamadı: {e}")
        kw = dict(is_nasa=True, h1=50, ws_col="ws50", wd_col="wd50")
        label = f"NASA POWER ({y1}-{y2})"
    df, q = clean_wind_data(raw)
    defaults = ec.EconomicInputs.from_defaults()
    allowed = {k: v for k, v in req.econ.items() if hasattr(defaults, k) and k != "capex_split"}
    try:
        econ = ec.EconomicInputs.from_defaults(**allowed)
    except TypeError as e:
        raise HTTPException(400, f"Ekonomik girdi hatalı: {e}")
    alpha = req.alpha
    if req.method == "power" and alpha is None and not kw["is_nasa"]:
        alpha = float(cfg["wind_resource"]["fixed_alpha"]["value"])
    turbine = en.load_library_turbine(req.turbine, req.hub)
    return AnalysisInputs(lat=req.lat, lon=req.lon, df=df, quality=q.as_dict(), source_label=label, turbine=turbine,
                          econ=econ, n_turbines=req.n, method=req.method, alpha=alpha, z0=float(z0_table[req.z0_name]),
                          z0_name=req.z0_name, density_method=req.density, losses=req.losses,
                          emission_factor=req.ef, household_kwh=req.kwh, env_notes=req.notes, **kw)


def to_json(r: AnalysisResult) -> dict[str, Any]:
    i, e = r.inputs, r.energy
    ref = i.df[i.ws_col]
    h = wr.histogram_with_fit(ref)
    yearly = r.yearly
    out: dict[str, Any] = {
        "site": {"lat": i.lat, "lon": i.lon, "label": i.source_label, "is_nasa": i.is_nasa, "h1": i.h1},
        "quality": i.quality,
        "stats": r.stats,
        "rho": r.rho, "rho_is_standard": r.rho_is_standard,
        "pd_ref": r.pd_ref, "pd_hub": r.pd_hub, "wind_class": r.wind_class,
        "ws_hub_mean": float(r.ws_hub.mean()),
        "weibull": {"mle": vars(r.weibull_mle), "mom": vars(r.weibull_mom),
                    "pd_mle": wr.power_density_weibull(r.weibull_mle.k, r.weibull_mle.c, r.rho),
                    "pd_mom": wr.power_density_weibull(r.weibull_mom.k, r.weibull_mom.c, r.rho)},
        "hist": {"centers": (h["edges"][:-1] + h["edges"][1:]) / 2, "density": h["density"], "x": h["x"],
                 "fits": {name: y for name, (_, y) in h["fits"].items()}},
        "rose": None if r.rose is None else {"sector": list(r.rose["sector"]), "freq": r.rose["freq_pct"],
                                             "mean": r.rose["mean_ws"]},
        "monthly": list(r.monthly.reindex(range(1, 13)).values),
        "diurnal": list(wr.diurnal_profile(ref).reindex(range(24)).values),
        "yearly": {"years": [int(y) for y in yearly.index], "values": yearly.values, "cov": r.cov},
        "alpha": r.alpha_used, "compare": r.method_compare,
        "energy": {
            "turbine": e["turbine"], "rated_kw": i.turbine.rated_kw, "rotor_d": i.turbine.rotor_d,
            "hub": i.turbine.hub_height, "n": i.n_turbines, "capacity_mw": e["capacity_mw"],
            "gross": e["gross_aep_ts"], "gross_weibull": e["gross_aep_weibull"], "diff_pct": e["method_diff_pct"],
            "net": e["net_aep"], "cf": e["capacity_factor"], "flh": e["full_load_hours"],
            "loss_pct": e["total_loss_pct"],
            "losses": [{"key": row.key, "label": row.label, "rate": row.rate, "mwh": row.lost_mwh}
                       for row in e["loss_table"].itertuples()],
            "monthly_net": list(e["monthly_net"].reindex(range(1, 13)).values),
            "curve_std": {"v": e["curve_std"]["wind_speed"], "p": e["curve_std"]["power_kw"]},
            "curve_site": {"v": e["curve_site"]["wind_speed"], "p": e["curve_site"]["power_kw"]},
            "weibull_hub": vars(e["weibull_hub"]),
        },
        "env": {k: v for k, v in r.env.items() if k != "qualitative"},
        "econ": None, "econ_error": r.econ_error,
    }
    if r.econ:
        c, T = r.econ, r.econ["table"]
        ok, text = ec.verdict(c, i.econ.discount_rate)
        s = r.sensitivity
        smax = s[np.isclose(s["delta"].abs(), s["delta"].abs().max())]
        out["econ"] = {
            "capex": c["capex"], "breakdown": c["capex_breakdown"], "lcoe": c["lcoe"], "npv": c["npv"], "irr": c["irr"],
            "payback": c["payback"], "dpayback": c["discounted_payback"], "ok": ok, "verdict": text,
            "currency": i.econ.currency, "discount_rate": i.econ.discount_rate, "lifetime": i.econ.lifetime,
            "table": {"year": [int(y) for y in T.index], "energy": T["energy_mwh"], "revenue": T["revenue"],
                      "opex": T["opex"], "tax": T["tax"], "net": T["net_cf"], "cum": T["cum_cf"], "price": T["price"]},
            "tornado": [{"label": lab, "lo": float(g[g.delta < 0]["d_npv"].iloc[0]), "hi": float(g[g.delta > 0]["d_npv"].iloc[0])}
                        for lab, g in smax.groupby("label")],
            "scenarios": [{"name": idx, "p": row.p_level, "aep": row.net_aep, "npv": row.npv, "irr": row.irr,
                           "lcoe": row.lcoe} for idx, row in r.scenarios.iterrows()],
        }
    return clean(out)


# ---------------------------------------------------------------- uç noktalar
@app.get("/api/meta")
def meta() -> dict[str, Any]:
    """Arayüz için türbin listesi ve varsayılan değerler."""
    cfg = load_defaults()
    t = en.list_turbines()
    def hubs(text: Any) -> list[float]:
        """'90;102' ya da '127,5' biçimli göbek yükseklikleri (ondalık virgül olabilir)."""
        out = []
        for part in str(text).split(";"):
            try:
                out.append(float(part.strip().replace(",", ".")))
            except ValueError:
                pass
        return sorted(v for v in out if not math.isnan(v))

    turbines = [{"type": r.turbine_type, "maker": r.manufacturer, "kw": r.rated_kw, "rotor": r.rotor_d,
                 "hubs": hubs(r.hub_heights)} for r in t.itertuples()]
    econ = {k: v["value"] for k, v in cfg["economics"].items() if k not in ("capex_split", "sensitivity_steps")}
    return clean({
        "turbines": turbines,
        "z0": cfg["wind_resource"]["roughness_z0"]["value"],
        "losses": {k: {"value": v["value"], "label": en.LOSS_LABELS.get(k, k)} for k, v in cfg["losses"].items()},
        "econ": econ,
        "env": {k: v["value"] for k, v in cfg["environment"].items()},
        "cover": {k: cfg["report"][k]["value"] for k in ("university", "department", "course")},
        "years": default_year_range(),
        "qualitative": {k: {"title": t_, "hint": h_} for k, (t_, h_) in env.QUALITATIVE_SECTIONS.items()},
    })


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest) -> dict[str, Any]:
    try:
        return to_json(run_analysis(build_inputs(req)))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/report")
def report(req: AnalyzeRequest) -> Response:
    """Word raporunu üretir ve dosya olarak döndürür."""
    from core.report import ReportMeta, build_report

    try:
        result = run_analysis(build_inputs(req))
    except ValueError as e:
        raise HTTPException(400, str(e))
    meta_ = ReportMeta.from_defaults(req.project or "Adsız proje", author=req.author, include_map=True,
                                     **{k: v for k, v in req.cover.items() if k in ("university", "department", "course",
                                                                                    "instructor", "student_no")})
    path = build_report(result, meta_, out_dir=Path(tempfile.gettempdir()) / "raporlar")
    name = "fizibilite_raporu.docx"
    return Response(path.read_bytes(), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
