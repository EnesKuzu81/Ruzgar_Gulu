"""MGM istasyon verisi (zip) okuma testleri."""
import io
import zipfile

import numpy as np
import pandas as pd
import pytest

from core.data_sources import clean_wind_data, load_mgm_zip, parse_mgm_wind

HEAD = {"Istasyon_No": 17220, "Istasyon_Adi": "IZMIR BOLGE"}


def frame(values, col):
    t = pd.date_range("2024-01-01 00:00", periods=len(values), freq="h")
    return pd.DataFrame({**HEAD, "YIL": t.year, "AY": t.month, "GUN": t.day, "SAAT": t.hour, col: values})


def xlsx(df) -> bytes:
    buf = io.BytesIO()
    df.to_excel(buf, index=False, sheet_name="Report")
    return buf.getvalue()


def make_zip(wind=True, extra=True) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("İzmir/X_Beni_Oku!!!.txt",
                   "İstasyon Numarası|İstasyon Adı|İl|İlçe|Enlem|Boylam|Rakım\n17220|İZMİR BÖLGE|İzmir|Konak|38.3949|27.0819|29\n"
                   .encode("cp1254"))
        if wind:
            z.writestr("İzmir/X-Saatlik Rüzgar Yönü ve Hızı (m/sn).xlsx",
                       xlsx(frame(["WSW1.1", "C  0.0", "N  5.0", "SE 12.4"], "RUZGAR_YONU_VE_HIZI")))
        if extra:
            z.writestr("İzmir/X-Saatlik Sıcaklık (°C).xlsx", xlsx(frame([5.0, 6.0, 7.0, 8.0], "SICAKLIK_°C")))
            z.writestr("İzmir/X-Saatlik Aktüel Basınç (hPa).xlsx", xlsx(frame([1013.0, 1012.0, 1011.0, 1010.0], "AKTUEL_BASINC_hPa")))
    buf.seek(0)
    return buf


def test_parse_wind_codes():
    out = parse_mgm_wind(pd.Series(["WSW1.1", "C  0.0", "N  5.0", "SE 12.4", "???"]))
    assert out.loc[0, "wd"] == 247.5 and out.loc[2, "wd"] == 0.0 and out.loc[3, "wd"] == 135.0
    assert np.isnan(out.loc[1, "wd"]) and out.loc[1, "ws"] == 0.0     # sakin (C)
    assert out["ws"].tolist()[:4] == [1.1, 0.0, 5.0, 12.4]
    assert np.isnan(out.loc[4, "ws"])


def test_load_mgm_zip():
    df = load_mgm_zip(make_zip())
    assert list(df.columns) == ["ws", "wd", "t2m_c", "ps_kpa"]
    assert df.attrs["height_m"] == 10 and df.attrs["lat"] == pytest.approx(38.3949)
    assert df.attrs["station"] == "İZMİR BÖLGE"
    assert df["ps_kpa"].iloc[0] == pytest.approx(101.3)
    # yerel saat 00:00 (UTC+3) -> 21:00 UTC bir önceki gün
    assert df.index[0] == pd.Timestamp("2023-12-31 21:00", tz="UTC")
    clean, rep = clean_wind_data(df)
    assert rep.missing_pct == 0


def test_load_mgm_zip_wind_only_and_missing_wind():
    df = load_mgm_zip(make_zip(extra=False), height_m=12)
    assert list(df.columns) == ["ws", "wd"] and df.attrs["height_m"] == 12
    with pytest.raises(ValueError, match="Rüzgar"):
        load_mgm_zip(make_zip(wind=False))
