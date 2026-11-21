"""Rüzgar enerjisi fizibilite uygulaması (Streamlit arayüzü).

Hesaplar core/ altındaki saf fonksiyonlarla yapılır; bu dosya yalnızca girdi, gösterim ve önbellekten sorumludur.
"""
from __future__ import annotations

import html
import sys
from dataclasses import replace
from pathlib import Path

import folium
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from streamlit_folium import st_folium

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core import economics as ec  # noqa: E402
from core import energy as en  # noqa: E402
from core import environment as env  # noqa: E402
from core import wind_resource as wr  # noqa: E402
from core.config import load_defaults  # noqa: E402
from core.data_sources import (clean_wind_data, default_year_range, fetch_nasa_power,  # noqa: E402
                               load_measurement_csv, load_mgm_zip)

st.set_page_config(page_title="Rüzgar Fizibilite", page_icon=None, layout="wide")

ACCENT, NEG, BAR, MUTED = "#0e6b5a", "#a2412c", "#c9d3cf", "#9aa5a1"
CFG = load_defaults()

# ---------------------------------------------------------------- stil
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root {
  --ink: #1c2422; --muted: #56625e; --line: #d5d9d6; --line-soft: #e4e7e5;
  --surface: #ffffff; --bg: #f3f4f3;
  --accent: #0e6b5a; --accent-ink: #0a5244; --accent-soft: #e2eeea;
  --neg: #a2412c; --neg-ink: #8a3524; --neg-soft: #f6e7e3;
  --radius: 6px;
}
html, body, [class*="css"], .stMarkdown, .stTextInput, .stNumberInput, .stSelectbox, button { font-family: "IBM Plex Sans", sans-serif; }
#MainMenu, footer, [data-testid="stMainMenu"], [data-testid="stAppDeployButton"], [data-testid="stDecoration"] { display: none; }
[data-testid="stHeader"] { background: transparent; }
[data-stale="true"] { opacity: 1 !important; transition: none !important; }   /* yeniden hesapta ekran soluklaşmasın */
.block-container { padding-top: 1.4rem; max-width: 1400px; }
h2, h3 { font-weight: 600 !important; letter-spacing: -0.01em; }
.note { color: var(--muted); font-size: 0.8rem; }

/* kenar çubuğu */
[data-testid="stSidebar"] { border-right: 1px solid var(--line); }
[data-testid="stSidebar"] h3 { font-size: 0.85rem; font-weight: 600; color: var(--ink); margin: 1.3rem 0 0.1rem; }
[data-testid="stSidebar"] [data-testid="stNumberInputStepDown"],
[data-testid="stSidebar"] [data-testid="stNumberInputStepUp"] { display: none; }   /* koordinat kesilmesin */
.brand { font-weight: 600; font-size: 1rem; color: var(--ink); line-height: 1.3; }
.brand span { display: block; font-weight: 400; font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem; }

/* başlık */
.app-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.9rem; }
.app-head h1 { font-size: 1.5rem; font-weight: 600; margin: 0; padding: 0; line-height: 1.25; letter-spacing: -0.015em; text-wrap: balance; }
.app-head .meta { color: var(--muted); font-size: 0.85rem; margin-top: 0.25rem; }
.pill { flex: none; display: inline-flex; align-items: center; padding: 0.35rem 0.75rem; border-radius: 999px;
        font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
.pill.ok { background: var(--accent-soft); color: var(--accent-ink); }
.pill.no { background: var(--neg-soft); color: var(--neg-ink); }
.pill.wait { background: var(--surface); color: var(--muted); border: 1px solid var(--line); font-weight: 500; }

/* sonuç şeridi: kaynak, enerji, ekonomi */
.kgroups { display: grid; grid-template-columns: 2fr 2fr 4fr; gap: 0.75rem; margin-bottom: 1.1rem; }
.kg { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.6rem 0.85rem 0.7rem; min-width: 0; }
.kg > span { display: block; font-size: 0.75rem; font-weight: 500; color: var(--muted); margin-bottom: 0.35rem; }
.kcells { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0.75rem; }
.kcell { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcell small { display: block; font-size: 0.72rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.kcell b { font-family: "IBM Plex Mono", monospace; font-size: 1.15rem; font-weight: 500; color: var(--ink); }
.kcell i { font-style: normal; font-size: 0.72rem; color: var(--muted); margin-left: 0.2rem; }
.kcell.neg b { color: var(--neg); }
@media (max-width: 1100px) { .kgroups { grid-template-columns: 1fr 1fr; } .kg.econ { grid-column: 1 / -1; } }
@media (max-width: 640px)  { .kgroups { grid-template-columns: 1fr; } .kcells { grid-auto-flow: row; grid-template-columns: 1fr 1fr; } }

/* fizibilite kararı (yan şerit yok: tam ton arka plan) */
.verdict { display: flex; gap: 0.75rem; align-items: baseline; background: var(--accent-soft); color: var(--ink);
           border-radius: var(--radius); padding: 0.75rem 1rem; margin-bottom: 1rem; }
.verdict b { flex: none; color: var(--accent-ink); }
.verdict.no { background: var(--neg-soft); }
.verdict.no b { color: var(--neg-ink); }

/* boş durum */
.empty { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.1rem 1.2rem 0.4rem; }
.empty h4 { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; color: var(--ink); }
.empty ol { margin: 0 0 0.6rem 1.1rem; padding: 0; color: var(--ink); font-size: 0.9rem; line-height: 1.6; }
.empty p { color: var(--muted); font-size: 0.85rem; margin: 0 0 0.6rem; }
.empty-tab { color: var(--muted); font-size: 0.9rem; padding: 2.5rem 0; text-align: center; }

[data-testid="stMetricValue"] { font-family: "IBM Plex Mono", monospace; font-size: 1.25rem; }
button[data-baseweb="tab"] p { font-size: 0.9rem; font-weight: 500; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
""", unsafe_allow_html=True)


def fig_layout(fig: go.Figure, height: int = 300, **kw) -> go.Figure:
    fig.update_layout(height=height, margin=kw.pop("margin", dict(l=48, r=12, t=10, b=40)), showlegend=kw.pop("showlegend", False),
                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      font=dict(family="IBM Plex Sans", size=12, color="#1c2422"), **kw)
    fig.update_xaxes(gridcolor="#e4e7e5", zeroline=False)
    fig.update_yaxes(gridcolor="#e4e7e5", zeroline=False)
    return fig


def fmt(x: float | None, d: int = 0) -> str:
    """Sayıyı binlik boşlukla biçimler (ör. 5 567)."""
    return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:,.{d}f}".replace(",", " ")


# ---------------------------------------------------------------- önbellekli hesaplar
@st.cache_data(show_spinner=False)
def load_power(lat: float, lon: float, y1: int, y2: int):
    df, rep = clean_wind_data(fetch_nasa_power(lat, lon, y1, y2))
    return df, rep.as_dict()


@st.cache_data(show_spinner=False)
def load_csv(content: bytes, height: float):
    import io
    df, rep = clean_wind_data(load_measurement_csv(io.BytesIO(content), height_m=height))
    return df, rep.as_dict()


@st.cache_data(show_spinner=False)
def load_mgm(content: bytes, height: float):
    import io
    raw = load_mgm_zip(io.BytesIO(content), height_m=height)
    df, rep = clean_wind_data(raw)
    return df, rep.as_dict(), dict(raw.attrs)


@st.cache_data(show_spinner=False)
def turbine_list() -> pd.DataFrame:
    return en.list_turbines()


@st.cache_data(show_spinner=False)
def library_turbine(name: str, hub: float) -> en.Turbine:
    return en.load_library_turbine(name, hub)


# ---------------------------------------------------------------- durum
ss = st.session_state
ss.setdefault("lat", 38.42)
ss.setdefault("lon", 27.14)
ss.setdefault("data", None)
if "pending_loc" in ss:                      # haritadan gelen konum, widget'lar çizilmeden uygulanır
    ss.lat, ss.lon = ss.pop("pending_loc")
    if not ss.pop("keep_data", False):       # MGM yüklemesi konumu istasyona taşır, veriyi korur
        ss.data = None

y_def = default_year_range()


def load_sample(widgets_drawn: bool = False) -> bool:
    """Örnek saha: İzmir, NASA POWER son 5 tam yıl (önbellekte hazır).

    Koordinat kutuları çizildikten sonra değerleri değiştirilemez; o durumda konum bir sonraki çizime bırakılır.
    """
    try:
        _df, _rep = load_power(38.42, 27.14, y_def[0], y_def[1])
    except Exception:
        return False
    if widgets_drawn:
        ss.pending_loc, ss.keep_data = (38.42, 27.14), True
    else:
        ss.lat, ss.lon = 38.42, 27.14
    ss.data = dict(df=_df, rep=_rep, src="NASA POWER", h1=50, col="ws50", wd="wd50",
                   label=f"NASA POWER ({y_def[0]}-{y_def[1]})")
    return True


if ss.data is None and st.query_params.get("ornek") == "1":     # ?ornek=1: örnek sahayı otomatik yükle
    load_sample()
turbines = turbine_list()
wr_cfg, en_cfg = CFG["wind_resource"], CFG["energy"]

# ---------------------------------------------------------------- kenar çubuğu
with st.sidebar:
    st.markdown("<div class='brand'>Rüzgar Enerjisi Fizibilite<span>EEM Rüzgar Enerjisi dersi projesi</span></div>",
                unsafe_allow_html=True)

    st.markdown("### Proje")
    project = st.text_input("Proje adı", "İzmir Rüzgar Sahası")
    author = st.text_input("Hazırlayan", "")

    st.markdown("### Konum")
    c1, c2 = st.columns(2)
    c1.number_input("Enlem", -90.0, 90.0, key="lat", step=0.01, format="%.4f")
    c2.number_input("Boylam", -180.0, 180.0, key="lon", step=0.01, format="%.4f")
    st.caption("Saha & Veri sekmesinde haritaya tıklayarak da seçebilirsiniz.")

    st.markdown("### Rüzgar verisi")
    source = st.radio("Kaynak", ["NASA POWER", "MGM istasyon verisi (zip)", "Kendi ölçümüm (CSV)"],
                      label_visibility="collapsed")
    if source == "NASA POWER":
        c1, c2 = st.columns(2)
        y1 = c1.number_input("Başlangıç yılı", 2001, y_def[1], y_def[0])
        y2 = c2.number_input("Bitiş yılı", 2001, y_def[1], y_def[1])
        if st.button("Veriyi getir", type="primary", use_container_width=True):
            if y1 > y2:
                st.error("Başlangıç yılı bitiş yılından büyük olamaz.")
            else:
                with st.spinner(f"NASA POWER'dan {y2 - y1 + 1} yıllık saatlik veri alınıyor..."):
                    try:
                        df, rep = load_power(round(ss.lat, 4), round(ss.lon, 4), int(y1), int(y2))
                        ss.data = dict(df=df, rep=rep, src="NASA POWER", h1=50, col="ws50", wd="wd50",
                                       label=f"NASA POWER ({y1}-{y2})")
                    except Exception as e:  # ağ hatası vb.
                        st.error(f"Veri alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin. ({e})")
    elif source.startswith("MGM"):
        up_mgm = st.file_uploader("MGM zip dosyası", type=["zip"],
                                  help="MGM'den alınan saatlik veri zip'i: rüzgar yönü ve hızı zorunlu, "
                                       "sıcaklık ve basınç varsa hava yoğunluğu ölçümden hesaplanır.")
        h_mgm = st.number_input("Anemometre yüksekliği (m)", 1.0, 200.0,
                                float(CFG["data"]["mgm_anemometer_height"]["value"]))
        if up_mgm is not None and ss.get("mgm_key") != (up_mgm.name, up_mgm.size, h_mgm):
            try:
                with st.spinner("MGM verisi okunuyor..."):
                    df, rep, info = load_mgm(up_mgm.getvalue(), h_mgm)
                off = pd.Timedelta(hours=CFG["data"]["mgm_utc_offset"]["value"])      # yerel saatle göster
                years = f"{(pd.Timestamp(rep['start']) + off).year}-{(pd.Timestamp(rep['end']) + off).year}"
                st_name = f"istasyon {info['station_no']}" if info.get("station_no") else "istasyon"
                ss.data = dict(df=df, rep=rep, src="MGM", h1=h_mgm, col="ws", wd="wd",
                               label=f"MGM {st_name}, {h_mgm:g} m ({years})")
                ss.mgm_key = (up_mgm.name, up_mgm.size, h_mgm)
                if "lat" in info:                 # konumu istasyona taşı
                    ss.pending_loc, ss.keep_data = (info["lat"], info["lon"]), True
                    st.rerun()
            except ValueError as e:
                st.error(str(e))
    else:
        up = st.file_uploader("Ölçüm CSV dosyası", type=["csv", "txt"],
                              help="Zaman ve hız sütunları zorunlu, yön, sıcaklık ve basınç opsiyonel.")
        h_meas = st.number_input("Ölçüm yüksekliği (m)", 1.0, 200.0, 30.0)
        if up is not None:
            try:
                df, rep = load_csv(up.getvalue(), h_meas)
                ss.data = dict(df=df, rep=rep, src="Ölçüm", h1=h_meas, col="ws", wd="wd" if "wd" in df else None,
                               label=f"ölçüm ({h_meas:g} m)")
            except ValueError as e:
                st.error(str(e))

    st.markdown("### Türbin")
    names = turbines["turbine_type"].tolist()
    default_t = en_cfg["default_turbine"]["value"]
    t_label = lambda n: (lambda r: f"{r.manufacturer} {n} ({r.rated_kw / 1000:g} MW)")(turbines.set_index("turbine_type").loc[n])
    t_name = st.selectbox("Model", names, index=names.index(default_t), format_func=t_label)
    hubs = turbines.set_index("turbine_type").loc[t_name, "hub_heights"]
    c1, c2 = st.columns(2)
    hub = c1.number_input("Göbek yüksekliği (m)", 20.0, 200.0, float(en_cfg["default_hub_height"]["value"]))
    n_turb = c2.number_input("Türbin adedi", 1, 50, int(en_cfg["n_turbines"]["value"]))
    if isinstance(hubs, str):
        st.caption(f"Üreticinin sunduğu göbek yükseklikleri: {hubs.replace(';', ', ')} m")
    with st.expander("Kendi güç eğrim"):
        curve_up = st.file_uploader("Güç eğrisi CSV", type=["csv"], help="Sütunlar: wind_speed (m/s), power_kw (kW)")

    st.markdown("### Gelişmiş")
    with st.expander("Yükseklik ve yoğunluk"):
        method = st.radio("Ekstrapolasyon", ["Power law", "Log law"], horizontal=True)
        z0_table = wr_cfg["roughness_z0"]["value"]
        z0_name = st.selectbox("Arazi tipi (z₀)", list(z0_table), index=list(z0_table).index("Nadas tarlası"))
        z0 = float(z0_table[z0_name])
        alpha = None
        if method == "Power law":
            site_alpha_ok = ss.data is not None and ss.data["src"] == "NASA POWER"
            a_mode = st.radio("α değeri", ["Sahadan hesapla", "Sabit"] if site_alpha_ok else ["Sabit"], horizontal=True)
            if a_mode == "Sabit":
                alpha = st.number_input("α", 0.0, 0.6, float(wr_cfg["fixed_alpha"]["value"]), 0.005, format="%.3f")
        dens_method = st.selectbox("Yoğunluk düzeltmesi", ["iec", "svenningsen"],
                                   format_func={"iec": "IEC 61400-12-1", "svenningsen": "Svenningsen (değişken üs)"}.get)

# ---------------------------------------------------------------- başlık
D = ss.data
head_slot, kpi_slot = st.empty(), st.empty()


def render_head(pill: str = "") -> None:
    """Proje adı, konum ve veri kaynağı; sağda fizibilite durumu."""
    meta = f"{ss.lat:.4f} K, {ss.lon:.4f} D" + (f" · {D['label']}" if D else "")
    head_slot.markdown(f"<div class='app-head'><div><h1>{html.escape(project or 'Adsız proje')}</h1>"
                       f"<div class='meta'>{meta}</div></div>{pill}</div>", unsafe_allow_html=True)


render_head("" if D else "<span class='pill wait'>Veri bekleniyor</span>")
tabs = st.tabs(["Saha & Veri", "Rüzgar Kaynağı", "Türbin & Enerji", "Ekonomi", "Çevre", "Rapor"])

# ---------------------------------------------------------------- 1. saha
with tabs[0]:
    left, right = st.columns([1.5, 1])
    with left:
        m = folium.Map(location=[ss.lat, ss.lon], zoom_start=9, tiles="OpenStreetMap", control_scale=True)
        folium.CircleMarker([ss.lat, ss.lon], radius=7, color=ACCENT, fill=True, fill_opacity=0.9).add_to(m)
        out = st_folium(m, height=420, use_container_width=True, returned_objects=["last_clicked"], key="map")
        click = (out or {}).get("last_clicked")
        if click and (round(click["lat"], 4), round(click["lng"], 4)) != (round(ss.lat, 4), round(ss.lon, 4)):
            ss.pending_loc = (round(click["lat"], 4), round(click["lng"], 4))
            st.rerun()
        st.caption("Konumu değiştirmek için haritaya tıklayın. Konum değişince veriyi yeniden getirmeniz gerekir.")
    with right:
        st.subheader("Veri kalitesi")
        if not D:
            st.markdown("<div class='empty'><h4>Başlamak için rüzgar verisi gerekiyor</h4><ol>"
                        "<li>Haritaya tıklayarak veya soldan koordinat girerek konumu seçin.</li>"
                        "<li>Soldaki panelden veri kaynağını seçin: NASA POWER, MGM zip ya da kendi CSV'niz.</li>"
                        "<li><b>Veriyi getir</b> düğmesine basın; sonuçlar bütün sekmelerde hesaplanır.</li></ol>"
                        "<p>Hızlıca denemek için hazır İzmir örneğini açabilirsiniz.</p></div>", unsafe_allow_html=True)
            if st.button("İzmir örneğini aç", type="primary"):
                if load_sample(widgets_drawn=True):
                    st.rerun()
                st.error("Örnek veri yüklenemedi. İnternet bağlantınızı kontrol edin.")
        else:
            r = D["rep"]
            loc_off = pd.Timedelta(hours=CFG["data"]["mgm_utc_offset"]["value"] if D["src"] == "MGM" else 0)
            st.dataframe(pd.DataFrame({
                "Ölçüt": ["Kapsanan süre", "Toplam kayıt", "Beklenen kayıt", "Eksik veri",
                          "Tekrarlı zaman damgası", "Fiziksel olmayan değer"],
                "Değer": [f"{pd.Timestamp(r['start']) + loc_off:%d.%m.%Y} - {pd.Timestamp(r['end']) + loc_off:%d.%m.%Y}",
                          fmt(r["total_records"]), fmt(r["expected_records"]), f"%{r['missing_pct']:.2f}",
                          fmt(r["duplicates_removed"]), fmt(r["out_of_range_removed"])]}),
                hide_index=True, use_container_width=True)
            if D["src"] == "NASA POWER":
                st.caption("NASA POWER bir reanaliz veri setidir (MERRA-2 tabanlı). Yerel arazi etkilerini "
                           "yumuşattığı için hızları gerçek ölçüme göre düşük gösterebilir.")
            elif D["src"] == "MGM":
                st.caption("MGM verisi gerçek istasyon ölçümüdür. İstasyonlar çoğunlukla yerleşim içinde ve 10 m'de "
                           "olduğu için binalar rüzgarı yavaşlatır; açık bir santral sahasını temsil etmeyebilir. "
                           "Göbek yüksekliğine taşırken arazi tipini (z₀) dikkatli seçin.")
            if r["missing_pct"] > 10:
                st.warning("Eksik veri oranı %10'un üzerinde. Sonuçlar mevsimsel olarak yanlı olabilir.")

if not D:
    for t in tabs[1:]:
        with t:
            st.markdown("<div class='empty-tab'>Bu bölüm, rüzgar verisi yüklendikten sonra dolacak. "
                        "Başlamak için <b>Saha & Veri</b> sekmesine dönün.</div>", unsafe_allow_html=True)
    st.stop()

# ---------------------------------------------------------------- ortak hesaplar
df = D["df"]
try:
    ws_hub = wr.extrapolate(df, hub, "power" if method == "Power law" else "log", alpha=alpha, z0=z0,
                            source_col=D["col"], h1=D["h1"])
except ValueError as e:
    st.error(f"Yükseklik ekstrapolasyonu yapılamadı: {e}")
    st.stop()
has_met = {"ps_kpa", "t2m_c"} <= set(df.columns)
rho_series = wr.air_density(df["ps_kpa"], df["t2m_c"]) if has_met else None
rho = float(rho_series.mean()) if has_met else float(en_cfg["standard_density"]["value"])

if curve_up is not None:
    try:
        turbine = en.load_custom_curve_csv(curve_up, hub, name=Path(curve_up.name).stem)
    except ValueError as e:
        st.error(str(e))
        st.stop()
else:
    turbine = library_turbine(t_name, hub)

losses_default = en.default_losses()
losses = {k: ss.get(f"loss_{k}", v * 100) / 100 for k, v in losses_default.items()}
E = en.energy_summary(ws_hub, turbine, rho, int(n_turb), losses, dens_method)
w_hub = E["weibull_hub"]
pd_hub = wr.power_density_timeseries(ws_hub, rho_series if has_met else rho)

econ_cfg = CFG["economics"]
inp = ec.EconomicInputs.from_defaults()
inp = replace(inp, **{k: ss[f"ec_{k}"] for k in
                      ["capex_per_kw", "opex_per_kw_year", "incentive_price", "incentive_years", "market_price",
                       "lifetime", "depreciation_years", "loan_term"] if f"ec_{k}" in ss},
              **{k: ss[f"ec_{k}"] / 100 for k in
                 ["opex_escalation", "price_escalation", "discount_rate", "degradation", "tax_rate",
                  "loan_share", "loan_rate", "aep_sigma"] if f"ec_{k}" in ss},
              loan_enabled=ss.get("ec_loan_enabled", inp.loan_enabled))
cap_kw = turbine.rated_kw * n_turb
try:
    R = ec.evaluate(inp, E["net_aep"], cap_kw)
    econ_error = None
except ValueError as e:
    R, econ_error = None, str(e)

# ---------------------------------------------------------------- sonuç şeridi
def kcell(label: str, value: str, unit: str = "", neg: bool = False) -> str:
    return f"<div class='kcell{' neg' if neg else ''}'><small>{label}</small><b>{value}</b><i>{unit}</i></div>"


cur = inp.currency
groups = [
    ("Rüzgar kaynağı", "", [kcell(f"Ort. hız ({hub:g} m)", fmt(ws_hub.mean(), 2), "m/s"),
                            kcell("Güç yoğunluğu", fmt(pd_hub), "W/m²")]),
    ("Enerji", "", [kcell("Net AEP", fmt(E["net_aep"]), "MWh/yıl"),
                    kcell("Kapasite faktörü", fmt(100 * E["capacity_factor"], 1), "%")]),
    ("Ekonomi", " econ", [
        kcell("LCOE", fmt(R["lcoe"], 1) if R else "-", f"{cur}/MWh" if R else ""),
        kcell("NPV", fmt(R["npv"] / 1e6, 2) if R else "-", f"M {cur}" if R else "", bool(R and R["npv"] < 0)),
        kcell("IRR", fmt(100 * R["irr"], 1) if R and R["irr"] is not None else "-",
              "%" if R and R["irr"] is not None else ""),
        kcell("Geri ödeme", fmt(R["payback"], 1) if R and R["payback"] is not None else "yok",
              "yıl" if R and R["payback"] is not None else "")]),
]
kpi_slot.markdown("<div class='kgroups'>" + "".join(
    f"<div class='kg{cls}'><span>{title}</span><div class='kcells'>{''.join(cells)}</div></div>"
    for title, cls, cells in groups) + "</div>", unsafe_allow_html=True)
if R:
    _ok = R["npv"] > 0
    render_head(f"<span class='pill {'ok' if _ok else 'no'}'>{'Fizibil' if _ok else 'Fizibil değil'}"
                f" · NPV {R['npv'] / 1e6:+.2f} M {cur}</span>")
else:
    render_head("<span class='pill wait'>Ekonomi hesaplanamadı</span>")

# ---------------------------------------------------------------- 2. rüzgar kaynağı
with tabs[1]:
    ref = df[D["col"]]
    stats = wr.basic_stats(ref)
    mle, mom = wr.fit_weibull_mle(ref), wr.fit_weibull_moments(ref)
    c = st.columns(5)
    c[0].metric(f"Ortalama ({D['h1']:g} m)", f"{stats['mean']:.2f} m/s")
    c[1].metric("Medyan", f"{stats['median']:.2f} m/s")
    c[2].metric("Standart sapma", f"{stats['std']:.2f} m/s")
    c[3].metric("Hava yoğunluğu", f"{rho:.3f} kg/m³", help=None if has_met else "Veride basınç/sıcaklık yok, standart değer kullanıldı.")
    c[4].metric("Sakin saatler", f"%{stats['calm_pct']:.1f}")

    left, right = st.columns([1.4, 1])
    with left:
        st.markdown(f"**Hız dağılımı ve Weibull uyumu ({D['h1']:g} m)**")
        h = wr.histogram_with_fit(ref)
        fig = go.Figure(go.Bar(x=(h["edges"][:-1] + h["edges"][1:]) / 2, y=h["density"], marker_color=BAR, name="Ölçülen"))
        for name, (p, y) in h["fits"].items():
            fig.add_scatter(x=h["x"], y=y, name=f"{name} (k={p.k:.2f}, c={p.c:.2f})",
                            line=dict(color=ACCENT if name == "MLE" else MUTED, width=2, dash=None if name == "MLE" else "dash"))
        st.plotly_chart(fig_layout(fig, showlegend=True, legend=dict(x=0.6, y=0.95), bargap=0.05,
                                   xaxis_title="Hız (m/s)", yaxis_title="Olasılık yoğunluğu"), use_container_width=True)
    with right:
        st.markdown("**Rüzgar gülü**")
        if D["wd"] and D["wd"] in df:
            rose = wr.wind_rose(ref, df[D["wd"]])
            fig = go.Figure(go.Barpolar(r=rose["freq_pct"], theta=rose["sector"], marker_color=ACCENT, opacity=0.85,
                                        customdata=rose["mean_ws"], hovertemplate="%{theta}: %{r:.1f} %<br>ort. %{customdata:.2f} m/s<extra></extra>"))
            fig.update_layout(polar=dict(angularaxis=dict(direction="clockwise", rotation=90),
                                         radialaxis=dict(ticksuffix="%", gridcolor="#e4e7e5"), bgcolor="rgba(0,0,0,0)"))
            st.plotly_chart(fig_layout(fig, margin=dict(l=30, r=30, t=20, b=20)), use_container_width=True)
            top = rose.sort_values("freq_pct").iloc[-1]
            st.caption(f"Baskın yön {top['sector']} (%{top['freq_pct']:.1f}).")
        else:
            st.info("Veride yön bilgisi yok.")

    left, right = st.columns(2)
    months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
    with left:
        st.markdown("**Aylık ortalama hız**")
        mp = wr.monthly_profile(ref)
        st.plotly_chart(fig_layout(go.Figure(go.Bar(x=[months[i - 1] for i in mp.index], y=mp, marker_color=ACCENT)),
                                   260, yaxis_title="m/s"), use_container_width=True)
    with right:
        st.markdown("**Günlük profil (yerel saat)**")
        dp = wr.diurnal_profile(ref)
        st.plotly_chart(fig_layout(go.Figure(go.Scatter(x=dp.index, y=dp, line=dict(color=ACCENT, width=2))),
                                   260, xaxis_title="Saat", yaxis_title="m/s"), use_container_width=True)

    left, right = st.columns(2)
    with left:
        st.markdown("**Weibull parametreleri ve güç yoğunluğu**")
        rho_for = rho_series if has_met else rho
        st.dataframe(pd.DataFrame({
            "Yöntem": ["Maximum Likelihood", "Momentler (ampirik)", "Zaman serisi, ½ρv³"],
            "k": [f"{mle.k:.2f}", f"{mom.k:.2f}", "-"], "c (m/s)": [f"{mle.c:.2f}", f"{mom.c:.2f}", "-"],
            "P/A (W/m²)": [fmt(wr.power_density_weibull(mle.k, mle.c, rho)), fmt(wr.power_density_weibull(mom.k, mom.c, rho)),
                           fmt(wr.power_density_timeseries(ref, rho_for))]}), hide_index=True, use_container_width=True)
        cls = wr.wind_class(wr.power_density_timeseries(ref, rho_for), D["h1"])
        st.caption(f"NREL rüzgar sınıfı ({cls['table_height']} m tablosu): **{cls['class']}, {cls['name']}**.")
    with right:
        st.markdown(f"**{hub:g} m göbek yüksekliğine ekstrapolasyon**")
        if D["src"] == "NASA POWER":
            cm = wr.compare_methods(df, hub, z0=z0, alpha=alpha)
            st.dataframe(pd.DataFrame({
                "Yöntem": [f"Power law (α = {cm['alpha']:.3f})", f"Log law (z₀ = {z0:g} m)"],
                "Ortalama hız (m/s)": [f"{cm['power_mean']:.2f}", f"{cm['log_mean']:.2f}"]}),
                hide_index=True, use_container_width=True)
            st.caption(f"İki yöntem arasındaki fark %{abs(cm['diff_pct']):.1f}. Hesapta seçili yöntem: {method}.")
        else:
            st.metric(f"{method} ile ortalama", f"{ws_hub.mean():.2f} m/s")
        yearly, cov = wr.annual_variability(ref)
        st.caption(f"Yıllar arası değişkenlik (CoV): %{cov:.1f}.")

# ---------------------------------------------------------------- 3. türbin & enerji
with tabs[2]:
    with st.expander("Kayıp oranları", expanded=False):
        cols = st.columns(3)
        for i, (k, v) in enumerate(losses_default.items()):
            cols[i % 3].number_input(f"{en.LOSS_LABELS[k]} (%)", 0.0, 50.0, float(v * 100), 0.5, key=f"loss_{k}",
                                     disabled=(k == "wake" and n_turb == 1),
                                     help="Tek türbinde iz kaybı uygulanmaz." if k == "wake" else None)
    c = st.columns(4)
    c[0].metric("Brüt AEP", f"{fmt(E['gross_aep_ts'])} MWh")
    c[1].metric("Net AEP", f"{fmt(E['net_aep'])} MWh", f"-%{E['total_loss_pct']:.1f} kayıp", delta_color="off")
    c[2].metric("Kapasite faktörü", f"%{100 * E['capacity_factor']:.1f}")
    c[3].metric("Tam yük saati", f"{fmt(E['full_load_hours'])} h")

    left, right = st.columns(2)
    with left:
        st.markdown(f"**Güç eğrisi: {turbine.name}, {fmt(turbine.rated_kw)} kW**")
        fig = go.Figure()
        fig.add_scatter(x=E["curve_std"]["wind_speed"], y=E["curve_std"]["power_kw"], name="Standart (ρ₀ = 1.225)",
                        line=dict(color=MUTED, dash="dash"))
        fig.add_scatter(x=E["curve_site"]["wind_speed"], y=E["curve_site"]["power_kw"], name=f"Saha (ρ = {rho:.3f})",
                        line=dict(color=ACCENT, width=2))
        st.plotly_chart(fig_layout(fig, showlegend=True, legend=dict(x=0.55, y=0.15), xaxis_title="Hız (m/s)",
                                   yaxis_title="Güç (kW)"), use_container_width=True)
    with right:
        st.markdown("**Brüttan nete kayıplar**")
        lt = E["loss_table"]
        lt = lt[lt["rate"] > 0]
        fig = go.Figure(go.Waterfall(x=["Brüt"] + lt["label"].tolist() + ["Net"],
                                     measure=["absolute"] + ["relative"] * len(lt) + ["total"],
                                     y=[E["gross_aep_ts"]] + (-lt["lost_mwh"]).tolist() + [0],
                                     connector=dict(line=dict(color=MUTED)), decreasing=dict(marker_color=NEG),
                                     increasing=dict(marker_color=ACCENT), totals=dict(marker_color=ACCENT)))
        fig_layout(fig, yaxis_title="MWh/yıl")
        fig.update_yaxes(range=[E["net_aep"] * 0.85, E["gross_aep_ts"] * 1.02])
        st.plotly_chart(fig, use_container_width=True)

    left, right = st.columns([1.4, 1])
    with left:
        st.markdown("**Aylık net üretim**")
        mn = E["monthly_net"]
        st.plotly_chart(fig_layout(go.Figure(go.Bar(x=[months[i - 1] for i in mn.index], y=mn, marker_color=ACCENT)),
                                   260, yaxis_title="MWh"), use_container_width=True)
    with right:
        st.markdown("**AEP yöntem karşılaştırması**")
        st.dataframe(pd.DataFrame({
            "Yöntem": ["Zaman serisi", "Weibull integrali"],
            "Brüt AEP (MWh/yıl)": [fmt(E["gross_aep_ts"]), fmt(E["gross_aep_weibull"])]}),
            hide_index=True, use_container_width=True)
        st.caption(f"Fark %{abs(E['method_diff_pct']):.1f}. Göbek yüksekliğinde Weibull k = {w_hub.k:.2f}, "
                   f"c = {w_hub.c:.2f} m/s. Net AEP zaman serisi yöntemine göre hesaplanır.")

# ---------------------------------------------------------------- 4. ekonomi
with tabs[3]:
    with st.expander("Ekonomik varsayımlar", expanded=econ_error is not None):
        g = lambda k: econ_cfg[k]["value"]
        c = st.columns(4)
        c[0].number_input(f"CAPEX ({inp.currency}/kW)", 0.0, 10000.0, float(g("capex_per_kw")), 50.0, key="ec_capex_per_kw")
        c[1].number_input(f"OPEX ({inp.currency}/kW/yıl)", 0.0, 500.0, float(g("opex_per_kw_year")), 1.0, key="ec_opex_per_kw_year")
        c[2].number_input("OPEX artışı (%/yıl)", 0.0, 20.0, g("opex_escalation") * 100, 0.5, key="ec_opex_escalation")
        c[3].number_input("İskonto oranı (%)", 0.0, 30.0, g("discount_rate") * 100, 0.5, key="ec_discount_rate")
        c = st.columns(4)
        c[0].number_input(f"Teşvik fiyatı ({inp.currency}/MWh)", 0.0, 500.0, float(g("incentive_price")), 1.0, key="ec_incentive_price")
        c[1].number_input("Teşvik süresi (yıl)", 0, 50, int(g("incentive_years")), key="ec_incentive_years")
        c[2].number_input(f"Teşvik sonrası fiyat ({inp.currency}/MWh)", 0.0, 500.0, float(g("market_price")), 1.0, key="ec_market_price")
        c[3].number_input("Fiyat eskalasyonu (%/yıl)", 0.0, 20.0, g("price_escalation") * 100, 0.5, key="ec_price_escalation")
        c = st.columns(4)
        c[0].number_input("Proje ömrü (yıl)", 1, 40, int(g("lifetime")), key="ec_lifetime")
        c[1].number_input("Degradasyon (%/yıl)", 0.0, 5.0, g("degradation") * 100, 0.1, key="ec_degradation")
        c[2].number_input("Kurumlar vergisi (%)", 0.0, 50.0, g("tax_rate") * 100, 1.0, key="ec_tax_rate")
        c[3].number_input("Amortisman süresi (yıl)", 1, 40, int(g("depreciation_years")), key="ec_depreciation_years")
        c = st.columns(4)
        loan_on = c[0].toggle("Kredi kullan", bool(g("loan_enabled")), key="ec_loan_enabled")
        c[1].number_input("Kredi payı (%)", 0.0, 100.0, g("loan_share") * 100, 5.0, key="ec_loan_share", disabled=not loan_on)
        c[2].number_input("Kredi faizi (%)", 0.0, 50.0, g("loan_rate") * 100, 0.5, key="ec_loan_rate", disabled=not loan_on)
        c[3].number_input("Vade (yıl)", 1, 30, int(g("loan_term")), key="ec_loan_term", disabled=not loan_on)
        st.number_input("AEP belirsizliği σ (%)", 0.0, 50.0, g("aep_sigma") * 100, 1.0, key="ec_aep_sigma")
        st.caption("Varsayılan değerler ve kaynakları config/defaults.yaml dosyasındadır. Teşvik fiyatı örnek değerdir.")

    if econ_error:
        st.error(f"Ekonomik hesap yapılamadı: {econ_error}")
    else:
        ok, txt = ec.verdict(R, inp.discount_rate)
        st.markdown(f"<div class='verdict{'' if ok else ' no'}'><b>{'Fizibil' if ok else 'Fizibil değil'}</b>"
                    f"<span>{txt}</span></div>", unsafe_allow_html=True)
        T = R["table"]
        # LCOE, NPV, IRR üstteki şeritte; burada şeritte olmayanlar
        c = st.columns(4)
        c[0].metric("Yatırım (CAPEX)", f"{R['capex'] / 1e6:.2f} M {inp.currency}")
        c[1].metric("1. yıl geliri", f"{T.loc[1, 'revenue'] / 1e3:,.0f} bin {inp.currency}".replace(",", " "))
        c[2].metric("1. yıl OPEX", f"{T.loc[1, 'opex'] / 1e3:,.0f} bin {inp.currency}".replace(",", " "))
        c[3].metric("İskontolu geri ödeme", "ömür içinde yok" if R["discounted_payback"] is None
                    else f"{R['discounted_payback']:.1f} yıl")

        left, right = st.columns([1.3, 1])
        with left:
            st.markdown("**Yıllık ve kümülatif nakit akışı**")
            fig = go.Figure(go.Bar(x=T.index, y=T["net_cf"] / 1e6, marker_color=[NEG if v < 0 else BAR for v in T["net_cf"]], name="Yıllık"))
            fig.add_scatter(x=T.index, y=T["cum_cf"] / 1e6, line=dict(color=ACCENT, width=2), name="Kümülatif")
            st.plotly_chart(fig_layout(fig, showlegend=True, legend=dict(x=0.02, y=0.98), xaxis_title="Yıl",
                                       yaxis_title=f"M {inp.currency}"), use_container_width=True)
        with right:
            st.markdown("**NPV duyarlılığı (±%20)**")
            S = ec.sensitivity(inp, E["net_aep"], cap_kw)
            s20 = S[np.isclose(S["delta"].abs(), 0.2)]
            lo, hi = (s20[s20.delta < 0].set_index("label")["d_npv"], s20[s20.delta > 0].set_index("label")["d_npv"])
            order = (hi - lo).abs().sort_values().index
            fig = go.Figure([go.Bar(y=order, x=lo[order] / 1e6, orientation="h", marker_color=NEG, name="-%20"),
                             go.Bar(y=order, x=hi[order] / 1e6, orientation="h", marker_color=ACCENT, name="+%20")])
            st.plotly_chart(fig_layout(fig, barmode="overlay", showlegend=True, legend=dict(x=0.75, y=0.05),
                                       margin=dict(l=110, r=12, t=10, b=40), xaxis_title=f"NPV değişimi (M {inp.currency})"),
                            use_container_width=True)

        st.markdown("**Senaryolar**")
        SC = ec.scenarios(inp, E["net_aep"], cap_kw)
        st.dataframe(pd.DataFrame({
            "Senaryo": SC.index, "AEP seviyesi": SC["p_level"], "Net AEP (MWh/yıl)": SC["net_aep"].map(fmt),
            f"NPV (M {inp.currency})": (SC["npv"] / 1e6).map(lambda v: f"{v:.2f}"),
            "IRR": SC["irr"].map(lambda v: "-" if v is None or pd.isna(v) else f"%{100 * v:.1f}"),
            f"LCOE ({inp.currency}/MWh)": SC["lcoe"].map(lambda v: f"{v:.1f}")}), hide_index=True, use_container_width=True)
        st.caption(f"P90 = P50·(1 − 1.282σ), P10 = P50·(1 + 1.282σ), σ = %{100 * inp.aep_sigma:.0f}.")

        with st.expander("Nakit akış tablosu"):
            show = T[["energy_mwh", "price", "revenue", "opex", "interest", "principal", "tax", "net_cf", "cum_cf"]].copy()
            show.columns = ["Üretim (MWh)", "Fiyat", "Gelir", "OPEX", "Faiz", "Anapara", "Vergi", "Net NA", "Kümülatif NA"]
            st.dataframe(show.round(0), use_container_width=True)

# ---------------------------------------------------------------- 5. çevre
with tabs[4]:
    env_cfg = CFG["environment"]
    c1, c2 = st.columns(2)
    ef = c1.number_input("Şebeke emisyon faktörü (tCO₂/MWh)", 0.0, 2.0, float(env_cfg["grid_emission_factor"]["value"]), 0.01, format="%.3f")
    kwh_h = c2.number_input("Hane tüketimi (kWh/yıl)", 100.0, 20000.0, float(env_cfg["household_consumption"]["value"]), 100.0)
    notes = {k: ss.get(f"env_{k}", "") for k in env.QUALITATIVE_SECTIONS}
    ENV = env.environment_summary(E["net_aep"], inp.lifetime, inp.degradation, ef, kwh_h, notes)
    c = st.columns(3)
    c[0].metric("Yıllık önlenen CO₂", f"{fmt(ENV['annual_co2_t'])} t")
    c[1].metric(f"{inp.lifetime} yıllık toplam", f"{fmt(ENV['lifetime_co2_t'])} t")
    c[2].metric("Karşılanan hane", f"≈ {fmt(ENV['households'])}")
    st.caption(f"Emisyon faktörü kaynağı: {env_cfg['grid_emission_factor']['source']}.")
    st.markdown("**Nitel değerlendirme**")
    st.caption("Bu metinler rapora olduğu gibi girer. Boş bırakılan başlık raporda 'değerlendirilmedi' olarak görünür.")
    c = st.columns(2)
    for i, (k, (title, hint)) in enumerate(env.QUALITATIVE_SECTIONS.items()):
        c[i % 2].text_area(title, key=f"env_{k}", placeholder=hint, height=100)

# ---------------------------------------------------------------- 6. rapor
with tabs[5]:
    if R:
        ok, txt = ec.verdict(R, inp.discount_rate)
        st.markdown(f"<div class='verdict{'' if ok else ' no'}'><b>{'Fizibil' if ok else 'Fizibil değil'}</b>"
                    f"<span>{txt}</span></div>", unsafe_allow_html=True)
    rc = CFG["report"]
    with st.expander("Kapak bilgileri", expanded=True):
        c = st.columns(3)
        uni = c[0].text_input("Üniversite", rc["university"]["value"])
        dept = c[1].text_input("Bölüm", rc["department"]["value"])
        course = c[2].text_input("Ders", rc["course"]["value"])
        c = st.columns(3)
        instr = c[0].text_input("Öğretim üyesi", rc["instructor"]["value"])
        sno = c[1].text_input("Öğrenci no", rc["student_no"]["value"])
        inc_map = c[2].toggle("Haritayı ekle", bool(rc["include_map"]["value"]), help="İnternet bağlantısı gerekir.")
    st.caption(f"Hazırlayan: {author or 'kenar çubuğunda boş'}. Boş bırakılan alanlar kapakta görünmez.")

    if st.button("Raporu oluştur", type="primary"):
        from core.analysis import AnalysisInputs, run_analysis
        from core.report import ReportMeta, build_report, to_pdf
        with st.spinner("Grafikler çiziliyor ve rapor yazılıyor..."):
            try:
                a_inp = AnalysisInputs(
                    lat=ss.lat, lon=ss.lon, df=df, quality=D["rep"], source_label=D["label"], turbine=turbine,
                    econ=inp, is_nasa=D["src"] == "NASA POWER", h1=D["h1"], ws_col=D["col"], wd_col=D["wd"],
                    n_turbines=int(n_turb), method="power" if method == "Power law" else "log", alpha=alpha,
                    z0=z0, z0_name=z0_name, density_method=dens_method, losses=losses,
                    emission_factor=ef, household_kwh=kwh_h, env_notes=notes)
                meta = ReportMeta(project=project or "Adsız proje", author=author, university=uni, department=dept,
                                  course=course, instructor=instr, student_no=sno, include_map=inc_map)
                path = build_report(run_analysis(a_inp), meta)
                ss.report = dict(docx=path, pdf=to_pdf(path))
            except Exception as e:
                ss.report = None
                st.error(f"Rapor oluşturulamadı: {e}")
    rep = ss.get("report")
    if rep:
        st.success(f"Rapor hazır: outputs/{rep['docx'].name}")
        c = st.columns([1, 1, 3])
        c[0].download_button("Word (.docx) indir", rep["docx"].read_bytes(), rep["docx"].name,
                             "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                             use_container_width=True)
        if rep["pdf"]:
            c[1].download_button("PDF indir", rep["pdf"].read_bytes(), rep["pdf"].name, "application/pdf",
                                 use_container_width=True)
        else:
            c[1].caption("PDF dönüşümü için Word veya LibreOffice gerekir.")
