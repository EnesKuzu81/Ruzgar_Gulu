"""Web API (webapp/api/index.py) duman testleri. FastAPI kurulu değilse atlanır."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx2")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "webapp"))
from fastapi.testclient import TestClient  # noqa: E402

from api.index import app  # noqa: E402

client = TestClient(app)


def test_meta_lists_turbines_and_defaults():
    m = client.get("/api/meta").json()
    assert len(m["turbines"]) > 50 and "capex_per_kw" in m["econ"]
    e82 = next(t for t in m["turbines"] if t["type"] == "E-82/2300")
    assert 98.0 in e82["hubs"]


def test_sample_analysis_matches_core():
    j = client.post("/api/analyze", json={"source": "sample"}).json()
    assert j["energy"]["net"] == pytest.approx(5567, abs=2)
    assert j["econ"]["npv"] == pytest.approx(-0.343e6, abs=5e3)
    assert len(j["monthly"]) == 12 and len(j["diurnal"]) == 24


def test_series_source_and_errors():
    times = [f"2024-01-01T{h:02d}:00:00Z" for h in range(24)]
    body = {"source": "series", "series": {"time": times, "ws": [6.0] * 24, "label": "test", "height": 50}}
    assert client.post("/api/analyze", json=body).status_code == 200
    assert client.post("/api/analyze", json={"source": "series"}).status_code == 400
    assert client.post("/api/analyze", json={"source": "sample", "z0_name": "yok"}).status_code == 400
